#!/usr/bin/env python3
import os
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape


REPORTS_DIR = Path("all-reports")
BUNDLE_DIR = Path("audit-report")
SUMMARY_MD = BUNDLE_DIR / "security-summary.md"
PDF_REPORT = BUNDLE_DIR / "website-security-audit-report.pdf"
DOCX_REPORT = BUNDLE_DIR / "security-audit-report.docx"
RAW_REPORTS_DIR = BUNDLE_DIR / "raw-reports"


def read_text(path):
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return f"Unable to read {path}: {exc}"


def collect_reports():
    reports = []
    if not REPORTS_DIR.exists():
        return reports

    for artifact_dir in sorted(path for path in REPORTS_DIR.iterdir() if path.is_dir()):
        files = []
        for file_path in sorted(path for path in artifact_dir.rglob("*") if path.is_file()):
            files.append(
                {
                    "name": file_path.name,
                    "relative_path": file_path.relative_to(REPORTS_DIR).as_posix(),
                    "content": read_text(file_path),
                }
            )
        reports.append({"name": artifact_dir.name, "files": files})
    return reports


def severity_counts(text):
    lowered = text.lower()
    return {
        "critical": lowered.count("critical"),
        "high": lowered.count("high"),
        "warning": lowered.count("warning") + lowered.count("missing"),
    }


def all_counts(reports):
    counts = {"critical": 0, "high": 0, "warning": 0}
    for report in reports:
        for file_info in report["files"]:
            file_counts = severity_counts(file_info["content"])
            for key, value in file_counts.items():
                counts[key] += value
    return counts


def scan_label(name):
    lowered = name.lower()
    labels = [
        ("ssl", "SSL/TLS"),
        ("headers", "Security Headers"),
        ("dns", "DNS Security"),
        ("cookie", "Cookie Security"),
        ("port", "Open Ports"),
        ("nikto", "Nikto"),
        ("zap", "OWASP ZAP"),
        ("trivy", "Dependency Scan"),
        ("gitleaks", "Secrets Scan"),
        ("trufflehog", "Credential Scan"),
    ]

    for needle, label in labels:
        if needle in lowered:
            return label
    return "Report"


def report_status(report):
    combined = "\n".join(file_info["content"] for file_info in report["files"]).lower()
    if "critical" in combined:
        return "critical"
    if "high" in combined or "vulnerable" in combined or "error" in combined:
        return "high"
    if "warning" in combined or "missing" in combined or "no dnssec" in combined:
        return "warning"
    return "ok"


def status_label(status):
    return {
        "critical": "Critical",
        "high": "High",
        "warning": "Review",
        "ok": "Clean",
    }.get(status, "Review")


def report_preview(report, limit=260):
    for file_info in report["files"]:
        for line in file_info["content"].splitlines():
            line = line.strip()
            if line:
                return line[:limit]
    return "No report content was captured."


def report_text(report):
    return "\n".join(file_info["content"] for file_info in report["files"])


def remediation_items(report):
    name = report["name"].lower()
    content = report_text(report).lower()
    items = []

    def add(title, detail):
        if not any(item["title"] == title for item in items):
            items.append({"title": title, "detail": detail})

    if "headers" in name or "security headers" in content:
        if "strict-transport-security" in content and "missing: strict-transport-security" in content:
            add(
                "Enable HSTS",
                "Add a Strict-Transport-Security header after confirming HTTPS works everywhere. Start with max-age=31536000; includeSubDomains, then consider preload only when all subdomains are HTTPS-ready.",
            )
        if "content-security-policy" in content and "missing: content-security-policy" in content:
            add(
                "Add a Content Security Policy",
                "Create a CSP that allows only trusted script, style, image, font, frame, and connect sources. Roll it out first with Content-Security-Policy-Report-Only, then enforce after fixing violations.",
            )
        if "x-content-type-options" in content and "missing: x-content-type-options" in content:
            add("Prevent MIME sniffing", "Set X-Content-Type-Options: nosniff on all HTTP responses.")
        if "x-frame-options" in content and "missing: x-frame-options" in content:
            add("Protect against clickjacking", "Set X-Frame-Options: DENY or SAMEORIGIN, or use CSP frame-ancestors for more precise framing rules.")
        if "referrer-policy" in content and "missing: referrer-policy" in content:
            add("Limit referrer leakage", "Set Referrer-Policy to strict-origin-when-cross-origin or a stricter value if the application does not need referrer data.")
        if "permissions-policy" in content and "missing: permissions-policy" in content:
            add("Restrict browser features", "Set Permissions-Policy to disable unused browser capabilities such as camera, microphone, geolocation, payment, and USB.")
        if "cache-control" in content and "missing: cache-control" in content:
            add("Control sensitive caching", "For authenticated or sensitive pages, set Cache-Control: no-store. For static assets, use explicit immutable cache rules with hashed filenames.")

    if "cookie" in name or "set-cookie" in content:
        if "missing httponly" in content:
            add("Set HttpOnly on session cookies", "Add the HttpOnly attribute to session cookies so client-side JavaScript cannot read them after an XSS issue.")
        if "missing secure" in content:
            add("Set Secure on cookies", "Add the Secure attribute so cookies are sent only over HTTPS.")
        if "missing samesite" in content:
            add("Set SameSite on cookies", "Use SameSite=Lax for most session cookies. Use SameSite=None; Secure only when cross-site cookie usage is required.")

    if "dns" in name:
        if "no dnssec" in content:
            add("Enable DNSSEC", "Enable DNSSEC signing at the DNS provider and publish DS records at the registrar, then verify validation from an external resolver.")
        if "no spf" in content or "missing: no spf" in content:
            add("Publish an SPF record", "Add a TXT record such as v=spf1 include:your-mail-provider -all, adjusted to match every legitimate sending service.")
        if "no dmarc" in content or "missing: no dmarc" in content:
            add("Publish a DMARC record", "Start with v=DMARC1; p=none; rua=mailto:security@example.com, review reports, then move to quarantine or reject when mail flow is verified.")
        if "no caa" in content:
            add("Restrict certificate authorities", "Publish CAA records for the certificate authorities allowed to issue certificates for the domain.")

    if "ssl" in name or "tls" in name:
        if "expires in less than 30 days" in content or "days until expiry: -" in content:
            add("Renew the TLS certificate", "Renew or replace the certificate and confirm automated renewal is working before the next expiry window.")
        if "ssl3" in content or "tls1:" in content or "tls1_1" in content:
            add("Disable obsolete TLS versions", "Disable SSLv3, TLS 1.0, and TLS 1.1. Prefer TLS 1.2 and TLS 1.3 with modern cipher suites.")
        if "medium" in content or "weak" in content:
            add("Harden cipher configuration", "Remove weak ciphers, enable forward secrecy, and prefer strong AEAD suites such as AES-GCM or ChaCha20-Poly1305.")

    if "port" in name or "/tcp" in content:
        risky_ports = {
            "21": "FTP",
            "22": "SSH",
            "23": "Telnet",
            "25": "SMTP",
            "3306": "MySQL",
            "5432": "PostgreSQL",
            "6379": "Redis",
            "27017": "MongoDB",
        }
        for port, service in risky_ports.items():
            if f"{port}/tcp" in content and "open" in content:
                add(
                    f"Review exposed {service} service",
                    f"Port {port} appears exposed. If public access is not required, restrict it with firewall/security-group rules, VPN access, or private networking.",
                )

    if "nikto" in name:
        if "server leaks" in content or "x-powered-by" in content:
            add("Reduce server fingerprinting", "Hide unnecessary version banners and X-Powered-By headers from the web server and application framework.")
        if "osvdb" in content or "vulnerable" in content or "allowed http methods" in content:
            add("Review Nikto findings", "Patch the affected web server, framework, or plugin, remove risky default files, and disable unnecessary HTTP methods.")

    if "zap" in name:
        if "alert" in content or "risk" in content or "fail" in content:
            add("Triage ZAP alerts", "Review each ZAP alert by risk level, reproduce the request, then fix the underlying issue such as missing validation, weak headers, exposed files, or unsafe redirects.")
        if "cross site scripting" in content or "xss" in content:
            add("Fix XSS risks", "Encode output by context, sanitize trusted HTML with an allowlist sanitizer, and use CSP as a second layer of protection.")
        if "sql injection" in content:
            add("Fix SQL injection risks", "Use parameterized queries or ORM bindings everywhere user input reaches a database query.")

    if "trivy" in name or "dependency" in name or "cve-" in content:
        if "critical" in content or "high" in content or "cve-" in content:
            add("Patch vulnerable dependencies", "Upgrade affected packages to fixed versions, rebuild lockfiles/images, and rerun Trivy to confirm the CVEs are gone.")
        if "misconfiguration" in content:
            add("Fix IaC misconfigurations", "Apply the Trivy recommendation for each misconfiguration and enforce the corrected baseline in infrastructure code.")

    if "gitleaks" in name or "trufflehog" in name or "secret" in content:
        if "secret" in content or "verified" in content or "private key" in content:
            add("Rotate exposed secrets", "Revoke and rotate any exposed tokens, keys, or passwords immediately. Remove them from Git history if needed and move secrets into GitHub Actions secrets or a vault.")

    if not items and report_status(report) != "ok":
        add(
            "Review scanner output",
            "Inspect the detailed scanner output, prioritize critical and high-risk items, apply vendor guidance, then rerun the workflow to verify remediation.",
        )

    if not items:
        add("Maintain current controls", "No obvious remediation rule matched this report. Keep monitoring, patch dependencies regularly, and rerun scans after infrastructure or application changes.")

    return items


def reset_bundle_dir():
    if BUNDLE_DIR.exists():
        shutil.rmtree(BUNDLE_DIR)
    BUNDLE_DIR.mkdir(parents=True)

    if REPORTS_DIR.exists():
        shutil.copytree(REPORTS_DIR, RAW_REPORTS_DIR)
    else:
        RAW_REPORTS_DIR.mkdir(parents=True)


def write_markdown(reports):
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "# Website Security Audit Summary",
        "",
        f"**Date:** {generated_at}",
        f"**Triggered by:** {os.environ.get('GITHUB_EVENT_NAME', 'local')}",
        "",
        "## Report Bundle",
        "",
        "- Open `website-security-audit-report.pdf` for the PDF report.",
        "- Open `security-audit-report.docx` for the document report.",
        "- Open `raw-reports/` for original scanner artifacts.",
        "",
        "## Scan Results",
        "",
    ]

    if not reports:
        lines.append("No downloaded reports were found.")
    else:
        for report in reports:
            lines.extend([f"### {report['name']}", ""])
            lines.extend(["#### Recommended fixes", ""])
            for item in remediation_items(report):
                lines.append(f"- **{item['title']}:** {item['detail']}")
            lines.append("")
            if not report["files"]:
                lines.extend(["No files found in this artifact.", ""])
                continue
            for file_info in report["files"]:
                lines.extend(
                    [
                        f"#### {file_info['relative_path']}",
                        "",
                        "```text",
                        file_info["content"],
                        "```",
                        "",
                    ]
                )

    SUMMARY_MD.write_text("\n".join(lines), encoding="utf-8")


def paragraph(text, style=None):
    escaped = escape(text)
    style_xml = f"<w:pPr><w:pStyle w:val=\"{style}\"/></w:pPr>" if style else ""
    return f"<w:p>{style_xml}<w:r><w:t xml:space=\"preserve\">{escaped}</w:t></w:r></w:p>"


def pdf_escape(text):
    return str(text).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def wrap_text(text, width=92):
    words = str(text).replace("\t", " ").split()
    if not words:
        return [""]

    lines = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if len(candidate) <= width:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word
    if current:
        lines.append(current)
    return lines


def write_pdf(reports):
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        ("title", "Website Security Audit Report"),
        ("body", f"Generated: {generated_at}"),
        ("body", f"Triggered by: {os.environ.get('GITHUB_EVENT_NAME', 'local')}"),
        ("space", ""),
        ("heading", "Report Bundle"),
        ("body", "This PDF summarizes the consolidated website security audit artifact."),
        ("body", "Original scanner outputs are included in raw-reports/."),
        ("space", ""),
        ("heading", "Scan Results"),
    ]

    if not reports:
        lines.append(("body", "No downloaded reports were found."))
    else:
        for report in reports:
            lines.extend([("space", ""), ("heading", report["name"]), ("subheading", "Recommended fixes")])
            for item in remediation_items(report):
                lines.append(("body", f"- {item['title']}: {item['detail']}"))
            if not report["files"]:
                lines.append(("body", "No files found in this artifact."))
                continue
            lines.append(("subheading", "Evidence files"))
            for file_info in report["files"]:
                counts = severity_counts(file_info["content"])
                meta = f"critical={counts['critical']}, high={counts['high']}, review={counts['warning']}"
                lines.append(("body", f"- {file_info['relative_path']} ({meta})"))

    styles = {
        "title": ("F2", 18, 24, 60),
        "heading": ("F2", 13, 18, 80),
        "subheading": ("F2", 10, 14, 90),
        "body": ("F1", 9, 13, 96),
        "space": ("F1", 8, 8, 1),
    }
    page_width = 612
    page_height = 792
    margin_x = 54
    margin_top = 60
    margin_bottom = 54
    pages = []
    current_page = []
    used_height = 0

    for style_name, text in lines:
        font, size, leading, width = styles[style_name]
        wrapped = [""] if style_name == "space" else wrap_text(text, width)
        block_height = len(wrapped) * leading + 3
        if current_page and used_height + block_height > page_height - margin_top - margin_bottom:
            pages.append(current_page)
            current_page = []
            used_height = 0
        current_page.append((style_name, wrapped))
        used_height += block_height
    if current_page:
        pages.append(current_page)

    objects = []

    def add_object(payload):
        objects.append(payload)
        return len(objects)

    font_regular = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    font_bold = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    page_refs = []

    for page_number, page in enumerate(pages, start=1):
        commands = [
            "q",
            "0.95 0.96 0.98 rg",
            f"0 {page_height - 38} {page_width} 38 re f",
            "Q",
            "BT /F2 9 Tf 54 768 Td (Website Security Audit) Tj ET",
        ]
        y = page_height - margin_top
        for style_name, wrapped in page:
            font, size, leading, _ = styles[style_name]
            if style_name == "space":
                y -= leading
                continue
            for line in wrapped:
                commands.append(f"BT /{font} {size} Tf {margin_x} {y} Td ({pdf_escape(line)}) Tj ET")
                y -= leading
            y -= 3
        commands.append(f"BT /F1 8 Tf 54 28 Td (Page {page_number} of {len(pages)}) Tj ET")
        stream = "\n".join(commands).encode("latin-1", errors="replace")
        content_ref = add_object(f"<< /Length {len(stream)} >>\nstream\n{stream.decode('latin-1')}\nendstream")
        page_ref = add_object(
            "<< /Type /Page /Parent 0 0 R "
            f"/MediaBox [0 0 {page_width} {page_height}] "
            f"/Resources << /Font << /F1 {font_regular} 0 R /F2 {font_bold} 0 R >> >> "
            f"/Contents {content_ref} 0 R >>"
        )
        page_refs.append(page_ref)

    pages_ref = len(objects) + 1
    for page_ref in page_refs:
        objects[page_ref - 1] = objects[page_ref - 1].replace("/Parent 0 0 R", f"/Parent {pages_ref} 0 R")
    kids = " ".join(f"{page_ref} 0 R" for page_ref in page_refs)
    add_object(f"<< /Type /Pages /Kids [{kids}] /Count {len(page_refs)} >>")
    catalog_ref = add_object(f"<< /Type /Catalog /Pages {pages_ref} 0 R >>")

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, payload in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n{payload}\nendobj\n".encode("latin-1", errors="replace"))
    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_ref} 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )
    PDF_REPORT.write_bytes(output)


def write_docx(reports):
    body = [
        paragraph("Website Security Audit", "Title"),
        paragraph(f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"),
        paragraph("This document summarizes all reports included in the full-security-audit artifact."),
        paragraph("Scan Results", "Heading1"),
    ]

    if not reports:
        body.append(paragraph("No downloaded reports were found."))
    else:
        for report in reports:
            body.append(paragraph(report["name"], "Heading2"))
            body.append(paragraph("Recommended fixes", "Heading3"))
            for item in remediation_items(report):
                body.append(paragraph(f"{item['title']}: {item['detail']}"))
            if not report["files"]:
                body.append(paragraph("No files found in this artifact."))
                continue
            for file_info in report["files"]:
                body.append(paragraph(file_info["relative_path"], "Heading3"))
                for line in file_info["content"].splitlines() or [""]:
                    body.append(paragraph(line))

    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {''.join(body)}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
"""
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
"""
    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""
    styles = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>
"""

    with zipfile.ZipFile(DOCX_REPORT, "w", compression=zipfile.ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", content_types)
        docx.writestr("_rels/.rels", rels)
        docx.writestr("word/document.xml", document_xml)
        docx.writestr("word/styles.xml", styles)


def main():
    reset_bundle_dir()
    reports = collect_reports()
    write_markdown(reports)
    write_pdf(reports)
    write_docx(reports)
    print(f"Generated {BUNDLE_DIR}/ with PDF, DOCX, Markdown, and raw reports.")


if __name__ == "__main__":
    main()
