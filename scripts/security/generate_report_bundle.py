#!/usr/bin/env python3
import html
import os
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape


REPORTS_DIR = Path("all-reports")
BUNDLE_DIR = Path("audit-report")
SUMMARY_MD = BUNDLE_DIR / "security-summary.md"
HTML_REPORT = BUNDLE_DIR / "index.html"
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

    root_files = sorted(path for path in REPORTS_DIR.iterdir() if path.is_file())
    if root_files:
        reports.append(
            {
                "name": "proof-of-concern-summary",
                "files": [
                    {
                        "name": file_path.name,
                        "relative_path": file_path.relative_to(REPORTS_DIR).as_posix(),
                        "content": read_text(file_path),
                    }
                    for file_path in root_files
                ],
            }
        )

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


STATUS_PRIORITY = {"critical": 4, "high": 3, "warning": 2, "ok": 1}


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
        ("proof-of-concern", "Proof of Concern"),
        ("poc", "Proof of Concern"),
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
        "critical": "Fix now",
        "high": "Needs attention",
        "warning": "Review soon",
        "ok": "Looks good",
    }.get(status, "Review")


def status_message(status):
    return {
        "critical": "Critical wording was found in the scanner output. Treat this as the first item to investigate.",
        "high": "High-risk, vulnerable, or error wording was found. Review this target before routine cleanup work.",
        "warning": "The scan found missing controls or warnings. These are usually configuration improvements.",
        "ok": "No obvious high-risk keywords were found in the captured scanner output.",
    }.get(status, "Review the scanner output for details.")


def overall_status(status_totals):
    if sum(status_totals.values()) == 0:
        return "No report data yet", "The workflow did not collect scanner output for this run."
    if status_totals["critical"]:
        return "Fix now", "At least one monitored target has critical findings."
    if status_totals["high"]:
        return "Needs attention", "At least one monitored target has high-risk findings or scan errors."
    if status_totals["warning"]:
        return "Review soon", "No critical/high wording was found, but some controls need review."
    return "Looks good", "No obvious issues were detected in the collected reports."


def health_score(status_totals):
    total = sum(status_totals.values())
    if total == 0:
        return 0
    penalty = (
        status_totals["critical"] * 35
        + status_totals["high"] * 24
        + status_totals["warning"] * 10
    )
    return max(0, min(100, 100 - round(penalty / total)))


def sorted_reports_by_priority(reports):
    return sorted(
        reports,
        key=lambda report: (STATUS_PRIORITY[report_status(report)], report["name"].lower()),
        reverse=True,
    )


def next_actions(reports, limit=6):
    actions = []
    seen = set()
    for report in sorted_reports_by_priority(reports):
        if report_status(report) == "ok":
            continue
        for item in remediation_items(report):
            key = item["title"].lower()
            if key in seen:
                continue
            seen.add(key)
            actions.append({"target": report["name"], **item})
            if len(actions) >= limit:
                return actions
    return actions


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


def html_attr(value):
    return html.escape(str(value), quote=True)


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
    status_totals = {"critical": 0, "high": 0, "warning": 0, "ok": 0}
    for report in reports:
        status_totals[report_status(report)] += 1
    overall_title, overall_detail = overall_status(status_totals)
    actions = next_actions(reports)
    lines = [
        "# Website Monitoring Report",
        "",
        f"**Date:** {generated_at}",
        f"**Triggered by:** {os.environ.get('GITHUB_EVENT_NAME', 'local')}",
        "",
        "## Quick read",
        "",
        f"**Overall status:** {overall_title}",
        "",
        overall_detail,
        "",
        f"**Targets reviewed:** {len(reports)}",
        f"**Targets needing attention:** {status_totals['critical'] + status_totals['high'] + status_totals['warning']}",
        f"**Targets that look good:** {status_totals['ok']}",
        "",
        "## What to do next",
        "",
    ]

    if actions:
        for action in actions:
            lines.append(f"- **{action['target']} - {action['title']}:** {action['detail']}")
    else:
        lines.append("- Keep the current monitoring schedule and rerun scans after website or infrastructure changes.")

    lines.extend(
        [
            "",
            "## Files in this bundle",
            "",
            "- Open `index.html` for the simple dashboard.",
            "- Open `security-audit-report.docx` for the Word-compatible report.",
            "- Open `raw-reports/` for original scanner artifacts.",
            "",
            "## Monitored targets",
            "",
        ]
    )

    if not reports:
        lines.append("No downloaded reports were found.")
    else:
        for report in sorted_reports_by_priority(reports):
            status = report_status(report)
            lines.extend(
                [
                    f"### {report['name']}",
                    "",
                    f"**Status:** {status_label(status)}",
                    "",
                    status_message(status),
                    "",
                    "**Recommended actions**",
                    "",
                ]
            )
            for item in remediation_items(report):
                lines.append(f"- **{item['title']}:** {item['detail']}")
            lines.append("")
            if not report["files"]:
                lines.extend(["No files found in this artifact.", ""])
                continue
            lines.extend(["<details>", "<summary>Raw scanner output</summary>", ""])
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
            lines.extend(["</details>", ""])

    SUMMARY_MD.write_text("\n".join(lines), encoding="utf-8")


def write_html(reports):
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    counts = all_counts(reports)
    total_files = sum(len(report["files"]) for report in reports)
    status_totals = {"critical": 0, "high": 0, "warning": 0, "ok": 0}
    for report in reports:
        status_totals[report_status(report)] += 1
    overall_title, overall_detail = overall_status(status_totals)
    actions = next_actions(reports)
    attention_count = status_totals["critical"] + status_totals["high"] + status_totals["warning"]
    priority_reports = sorted_reports_by_priority(reports)[:4]
    score = health_score(status_totals)
    total_reports = len(reports) or 1
    status_breakdown = [
        ("critical", "Fix now", status_totals["critical"]),
        ("high", "Needs attention", status_totals["high"]),
        ("warning", "Review soon", status_totals["warning"]),
        ("ok", "Looks good", status_totals["ok"]),
    ]
    status_breakdown_html = "\n".join(
        f"""
        <div class="status-row">
          <div class="status-row__label">
            <span class="dot dot--{html_attr(status)}"></span>
            <strong>{html.escape(label)}</strong>
            <em>{value}</em>
          </div>
          <div class="status-row__track">
            <span class="status-row__fill status-row__fill--{html_attr(status)}" style="width: {round((value / total_reports) * 100)}%"></span>
          </div>
        </div>
        """
        for status, label, value in status_breakdown
    )

    priority_html = "\n".join(
        f"""
        <li>
          <span class="priority-list__status badge badge--{html_attr(report_status(report))}">{html.escape(status_label(report_status(report)))}</span>
          <a href="#{html_attr(report["name"])}">{html.escape(report["name"])}</a>
          <small>{html.escape(status_message(report_status(report)))}</small>
        </li>
        """
        for report in priority_reports
    )

    actions_html = "\n".join(
        f"""
        <li>
          <b>{index}</b>
          <strong>{html.escape(action["title"])}</strong>
          <span>{html.escape(action["detail"])}</span>
          <em>{html.escape(action["target"])}</em>
        </li>
        """
        for index, action in enumerate(actions, start=1)
    ) or """
        <li>
          <b>1</b>
          <strong>Keep monitoring</strong>
          <span>No urgent findings were detected. Rerun scans after website, DNS, hosting, or dependency changes.</span>
          <em>All targets</em>
        </li>
    """

    nav_items = "\n".join(
        f"""
        <a href="#{html_attr(report["name"])}">
          <span>{html.escape(scan_label(report["name"]))}</span>
          <small>{html.escape(report["name"])}</small>
        </a>
        """
        for report in reports
    )

    sections = []
    for report in reports:
        status = report_status(report)
        scan = scan_label(report["name"])
        preview = report_preview(report)
        remedies = remediation_items(report)
        remedies_html = "\n".join(
            f"""
            <li>
              <strong>{html.escape(item["title"])}</strong>
              <span>{html.escape(item["detail"])}</span>
            </li>
            """
            for item in remedies
        )
        files_html = []
        for file_info in report["files"]:
            content = html.escape(file_info["content"])
            path = html.escape(file_info["relative_path"])
            file_counts = severity_counts(file_info["content"])
            file_meta = " / ".join(
                f"{label}: {file_counts[key]}"
                for key, label in [("critical", "Critical"), ("high", "High"), ("warning", "Review")]
                if file_counts[key]
            ) or "No keyword alerts"
            files_html.append(
                f"""
                <details class="file-panel">
                  <summary>
                    <span>{path}</span>
                    <em>{html.escape(file_meta)}</em>
                  </summary>
                  <pre>{content}</pre>
                </details>
                """
            )

        sections.append(
            f"""
            <section class="report-card" id="{html_attr(report["name"])}" data-report data-search="{html_attr(report["name"] + " " + scan + " " + preview)}" data-status="{html_attr(status)}">
              <div class="report-card__stripe report-card__stripe--{html_attr(status)}"></div>
              <div class="report-card__head">
                <div>
                  <p>{html.escape(scan)}</p>
                  <h2>{html.escape(report["name"])}</h2>
                </div>
                <span class="badge badge--{html_attr(status)}">{html.escape(status_label(status))}</span>
              </div>
              <p class="meaning">{html.escape(status_message(status))}</p>
              <div class="report-card__preview">{html.escape(preview)}</div>
              <div class="remedies">
                <div class="remedies__title">Recommended actions</div>
                <ul>{remedies_html}</ul>
              </div>
              <div class="raw-title">Raw scanner output</div>
              <div class="report-card__files">
                {''.join(files_html) if files_html else '<p class="empty">No files found in this artifact.</p>'}
              </div>
            </section>
            """
        )

    HTML_REPORT.write_text(
        f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Website Monitoring Report</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #eef3f7;
      --panel: #ffffff;
      --panel-soft: #f7fafc;
      --ink: #111827;
      --muted: #64748b;
      --line: #d7dee8;
      --accent: #0f766e;
      --accent-strong: #115e59;
      --blue: #2563eb;
      --danger: #b42318;
      --danger-bg: #fee4e2;
      --warn: #b54708;
      --warn-bg: #fef0c7;
      --ok: #027a48;
      --ok-bg: #dcfae6;
      --shadow: 0 12px 28px rgba(15, 23, 42, 0.10);
    }}
    * {{ box-sizing: border-box; }}
    html {{ scroll-behavior: smooth; }}
    body {{
      margin: 0;
      background: linear-gradient(180deg, #f8fbfd 0%, var(--bg) 56%, #e8eef5 100%);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }}
    .shell {{ min-height: 100vh; }}
    .hero {{
      padding: 34px 32px;
      color: #ffffff;
      background:
        linear-gradient(135deg, rgba(11, 18, 32, 0.98), rgba(18, 88, 100, 0.96) 58%, rgba(21, 94, 117, 0.98)),
        linear-gradient(45deg, rgba(14, 165, 233, 0.20), transparent);
      border-bottom: 1px solid rgba(255, 255, 255, 0.16);
    }}
    .hero__inner {{
      max-width: 1280px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: center;
    }}
    .eyebrow {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 999px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0;
    }}
    h1, h2, h3, p {{ margin: 0; }}
    h1 {{
      max-width: 760px;
      margin-top: 14px;
      font-size: 44px;
      line-height: 1.08;
      letter-spacing: 0;
    }}
    .hero__meta {{
      margin-top: 12px;
      color: rgba(255, 255, 255, 0.78);
      font-size: 14px;
    }}
    .hero__actions {{
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }}
    .score-card {{
      width: 220px;
      padding: 18px;
      border: 1px solid rgba(255, 255, 255, 0.20);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.11);
      backdrop-filter: blur(12px);
    }}
    .score-ring {{
      width: 154px;
      height: 154px;
      margin: 0 auto 12px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at center, #102436 0 57%, transparent 58%),
        conic-gradient(#22c55e calc(var(--score) * 1%), rgba(255, 255, 255, 0.20) 0);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
    }}
    .score-ring strong {{
      display: block;
      font-size: 38px;
      line-height: 1;
    }}
    .score-ring span {{
      display: block;
      margin-top: 4px;
      color: rgba(255, 255, 255, 0.72);
      font-size: 12px;
      text-align: center;
    }}
    .score-card p {{
      color: rgba(255, 255, 255, 0.78);
      font-size: 13px;
      text-align: center;
    }}
    .action {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      padding: 9px 14px;
      border-radius: 7px;
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.24);
      background: rgba(255, 255, 255, 0.12);
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
    }}
    .action--primary {{ background: #ffffff; color: #0f172a; }}
    .layout {{
      display: grid;
      grid-template-columns: 300px minmax(0, 1fr);
      gap: 24px;
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px 32px 36px;
    }}
    nav {{
      position: sticky;
      top: 20px;
      align-self: start;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      max-height: calc(100vh - 32px);
      overflow: auto;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    }}
    nav strong {{
      display: block;
      margin-bottom: 10px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0;
      color: var(--muted);
    }}
    nav a {{
      display: grid;
      gap: 2px;
      padding: 10px;
      color: var(--ink);
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
      overflow-wrap: anywhere;
    }}
    nav a:hover {{ background: #eef6f5; color: var(--accent-strong); }}
    nav small {{ color: var(--muted); font-size: 12px; }}
    .overview {{
      display: grid;
      grid-template-columns: repeat(5, minmax(120px, 1fr));
      gap: 14px;
      margin-bottom: 16px;
    }}
    .quick-summary,
    .next-actions {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 16px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
    }}
    .quick-summary {{
      display: grid;
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
      gap: 18px;
      align-items: start;
    }}
    .summary-copy {{
      display: grid;
      gap: 14px;
    }}
    .summary-callout {{
      padding: 14px;
      border: 1px solid #b6ece5;
      border-radius: 8px;
      background: #f0fdfa;
    }}
    .section-label {{
      margin-bottom: 5px;
      color: var(--accent-strong);
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0;
    }}
    .quick-summary h2 {{
      margin-bottom: 8px;
      font-size: 26px;
      line-height: 1.15;
    }}
    .quick-summary p,
    .next-actions span,
    .priority-list small {{
      color: var(--muted);
    }}
    .priority-list {{
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 10px;
    }}
    .priority-list li {{
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 4px 10px;
      align-items: center;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel-soft);
    }}
    .priority-list a {{
      color: var(--ink);
      font-weight: 800;
      text-decoration: none;
      overflow-wrap: anywhere;
    }}
    .priority-list small {{
      grid-column: 2;
      font-size: 13px;
    }}
    .priority-list__status {{
      align-self: start;
    }}
    .status-board {{
      display: grid;
      gap: 12px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel-soft);
    }}
    .status-row {{
      display: grid;
      gap: 7px;
    }}
    .status-row__label {{
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--ink);
      font-size: 13px;
    }}
    .status-row__label em {{
      margin-left: auto;
      color: var(--muted);
      font-style: normal;
      font-weight: 800;
    }}
    .status-row__track {{
      height: 9px;
      overflow: hidden;
      border-radius: 999px;
      background: #e2e8f0;
    }}
    .status-row__fill {{
      display: block;
      height: 100%;
      min-width: 0;
      border-radius: inherit;
    }}
    .status-row__fill--critical, .status-row__fill--high {{ background: #ef4444; }}
    .status-row__fill--warning {{ background: #f59e0b; }}
    .status-row__fill--ok {{ background: #22c55e; }}
    .dot {{
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--muted);
    }}
    .dot--critical, .dot--high {{ background: #ef4444; }}
    .dot--warning {{ background: #f59e0b; }}
    .dot--ok {{ background: #22c55e; }}
    .next-actions ul {{
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin: 10px 0 0;
      padding: 0;
      list-style: none;
    }}
    .next-actions li {{
      position: relative;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 4px 10px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel-soft);
    }}
    .next-actions b {{
      grid-row: span 3;
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 999px;
      background: #0f766e;
      color: #ffffff;
      font-size: 13px;
    }}
    .next-actions strong {{
      font-size: 15px;
    }}
    .next-actions em {{
      color: var(--accent-strong);
      font-style: normal;
      font-size: 12px;
      font-weight: 800;
      overflow-wrap: anywhere;
    }}
    .metric {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
    }}
    .metric__value {{ font-size: 28px; font-weight: 800; line-height: 1; }}
    .metric__label {{ margin-top: 7px; color: var(--muted); font-size: 13px; }}
    .toolbar {{
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
    }}
    .search {{
      width: 100%;
      min-height: 42px;
      border: 1px solid var(--line);
      border-radius: 7px;
      padding: 10px 12px;
      font: inherit;
      color: var(--ink);
      background: var(--panel-soft);
    }}
    .filters {{ display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }}
    .filter {{
      min-height: 36px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #ffffff;
      color: var(--ink);
      padding: 7px 11px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }}
    .filter.is-active {{
      color: #ffffff;
      background: var(--accent);
      border-color: var(--accent);
    }}
    .report-card {{
      position: relative;
      background: rgba(255, 255, 255, 0.94);
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-bottom: 16px;
      padding: 20px 18px 18px;
      box-shadow: var(--shadow);
      scroll-margin-top: 24px;
      overflow: hidden;
    }}
    .report-card__stripe {{
      position: absolute;
      inset: 0 0 auto 0;
      height: 5px;
      background: var(--muted);
    }}
    .report-card__stripe--critical, .report-card__stripe--high {{ background: #ef4444; }}
    .report-card__stripe--warning {{ background: #f59e0b; }}
    .report-card__stripe--ok {{ background: #22c55e; }}
    .report-card.is-hidden {{ display: none; }}
    .report-card__head {{
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }}
    .report-card__head p {{
      color: var(--accent-strong);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
    }}
    .report-card h2 {{
      margin-top: 4px;
      font-size: 21px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }}
    .report-card__preview {{
      margin: 12px 0 14px;
      color: var(--muted);
      overflow-wrap: anywhere;
    }}
    .meaning {{
      margin-top: 10px;
      color: var(--ink);
      font-weight: 600;
    }}
    .remedies {{
      margin: 0 0 14px;
      padding: 14px;
      background: #f0fdfa;
      border: 1px solid #b6ece5;
      border-radius: 8px;
    }}
    .remedies__title {{
      margin-bottom: 8px;
      color: var(--accent-strong);
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0;
    }}
    .remedies ul {{
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 8px;
    }}
    .remedies li {{ padding-left: 2px; }}
    .remedies strong {{
      display: block;
      color: var(--ink);
      margin-bottom: 2px;
    }}
    .remedies span {{
      display: block;
      color: var(--muted);
      overflow-wrap: anywhere;
    }}
    .badge {{
      flex: 0 0 auto;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 800;
      border: 1px solid transparent;
    }}
    .badge--critical, .badge--high {{
      background: var(--danger-bg);
      color: var(--danger);
      border-color: #fecdca;
    }}
    .badge--warning {{
      background: var(--warn-bg);
      color: var(--warn);
      border-color: #fedf89;
    }}
    .badge--ok {{
      background: var(--ok-bg);
      color: var(--ok);
      border-color: #abefc6;
    }}
    .report-card__files {{ display: grid; gap: 10px; }}
    .raw-title {{
      margin: 4px 0 8px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0;
    }}
    details.file-panel {{
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: #ffffff;
    }}
    summary {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      cursor: pointer;
      padding: 11px 12px;
      background: #f8fafc;
      font-weight: 600;
      overflow-wrap: anywhere;
    }}
    summary em {{
      color: var(--muted);
      font-style: normal;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }}
    pre {{
      margin: 0;
      padding: 16px;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 12px;
      line-height: 1.55;
      background: #0b1220;
      color: #e5edf7;
    }}
    .danger {{ color: var(--danger); }}
    .warn {{ color: var(--warn); }}
    .ok {{ color: var(--ok); }}
    .empty {{
      padding: 14px;
      color: var(--muted);
      background: var(--panel-soft);
      border-radius: 7px;
    }}
    .no-results {{
      display: none;
      padding: 22px;
      background: var(--panel);
      border: 1px dashed var(--line);
      border-radius: 8px;
      color: var(--muted);
      text-align: center;
    }}
    .no-results.is-visible {{ display: block; }}
    @media (max-width: 980px) {{
      .hero__inner {{ grid-template-columns: 1fr; }}
      .hero__actions {{ justify-content: flex-start; }}
      .score-card {{ width: 100%; max-width: 320px; }}
      .layout {{ grid-template-columns: 1fr; padding: 18px; }}
      nav {{ position: static; max-height: none; }}
      .overview {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
      .quick-summary {{ grid-template-columns: 1fr; }}
      .next-actions ul {{ grid-template-columns: 1fr; }}
      .toolbar {{ grid-template-columns: 1fr; }}
      .filters {{ justify-content: flex-start; }}
    }}
    @media (max-width: 560px) {{
      .hero {{ padding: 24px 18px; }}
      h1 {{ font-size: 31px; }}
      .score-ring {{ width: 132px; height: 132px; }}
      .overview {{ grid-template-columns: 1fr; }}
      .next-actions li {{ grid-template-columns: 1fr; }}
      .next-actions b {{ grid-row: auto; }}
      .report-card__head {{ display: grid; }}
      summary {{ align-items: flex-start; flex-direction: column; }}
      summary em {{ white-space: normal; }}
    }}
  </style>
</head>
<body>
  <div class="shell">
    <header class="hero">
      <div class="hero__inner">
        <div>
          <div class="eyebrow">Website Monitoring Report</div>
          <h1>{html.escape(overall_title)}</h1>
          <p class="hero__meta">{html.escape(overall_detail)} Generated {html.escape(generated_at)}.</p>
          <div class="hero__actions">
            <a class="action action--primary" href="security-audit-report.docx">Word Report</a>
            <a class="action" href="security-summary.md">Summary</a>
            <a class="action" href="raw-reports/">Raw Logs</a>
          </div>
        </div>
        <div class="score-card" aria-label="Website health score">
          <div class="score-ring" style="--score: {score}">
            <div>
              <strong>{score}</strong>
              <span>Health score</span>
            </div>
          </div>
          <p>Higher is better. The score drops when targets have critical, high-risk, or review findings.</p>
        </div>
      </div>
    </header>
    <main class="layout">
      <nav>
        <strong>Monitored Targets</strong>
        {nav_items or '<p>No artifacts found.</p>'}
      </nav>
      <div>
        <section class="quick-summary">
          <div class="summary-copy">
            <p class="section-label">Priority</p>
            <h2>Start here</h2>
            <div class="summary-callout">
              <p>{html.escape(overall_detail)}</p>
            </div>
            <div class="status-board" aria-label="Status distribution">
              {status_breakdown_html}
            </div>
          </div>
          <ol class="priority-list">
            {priority_html or '<li><strong>No targets found</strong><small>The workflow did not collect scanner reports.</small></li>'}
          </ol>
        </section>
        <section class="next-actions">
          <p class="section-label">Next actions</p>
          <ul>{actions_html}</ul>
        </section>
        <div class="overview">
          <div class="metric"><div class="metric__value">{len(reports)}</div><div class="metric__label">Targets Reviewed</div></div>
          <div class="metric"><div class="metric__value danger">{attention_count}</div><div class="metric__label">Need Attention</div></div>
          <div class="metric"><div class="metric__value ok">{status_totals["ok"]}</div><div class="metric__label">Look Good</div></div>
          <div class="metric"><div class="metric__value">{total_files}</div><div class="metric__label">Raw Log Files</div></div>
          <div class="metric"><div class="metric__value warn">{counts["warning"]}</div><div class="metric__label">Warnings Found</div></div>
        </div>
        <div class="toolbar">
          <input class="search" id="reportSearch" type="search" placeholder="Search reports, domains, scanners, findings">
          <div class="filters" aria-label="Report filters">
            <button class="filter is-active" type="button" data-filter="all">All</button>
            <button class="filter" type="button" data-filter="critical">Critical</button>
            <button class="filter" type="button" data-filter="high">High</button>
            <button class="filter" type="button" data-filter="warning">Review</button>
            <button class="filter" type="button" data-filter="ok">Clean</button>
          </div>
        </div>
        <div class="no-results" id="noResults">No matching reports found.</div>
        {''.join(sections) if sections else '<section class="report-card"><h2>No reports found</h2><p class="empty">No downloaded reports were found.</p></section>'}
      </div>
    </main>
  </div>
  <script>
    const searchInput = document.querySelector("#reportSearch");
    const cards = Array.from(document.querySelectorAll("[data-report]"));
    const buttons = Array.from(document.querySelectorAll("[data-filter]"));
    const noResults = document.querySelector("#noResults");
    let activeFilter = "all";

    function applyFilters() {{
      const query = (searchInput.value || "").trim().toLowerCase();
      let visible = 0;

      cards.forEach((card) => {{
        const matchesText = !query || card.dataset.search.toLowerCase().includes(query) || card.textContent.toLowerCase().includes(query);
        const matchesFilter = activeFilter === "all" || card.dataset.status === activeFilter;
        const shouldShow = matchesText && matchesFilter;
        card.classList.toggle("is-hidden", !shouldShow);
        if (shouldShow) visible += 1;
      }});

      noResults.classList.toggle("is-visible", visible === 0 && cards.length > 0);
    }}

    searchInput.addEventListener("input", applyFilters);
    buttons.forEach((button) => {{
      button.addEventListener("click", () => {{
        activeFilter = button.dataset.filter;
        buttons.forEach((item) => item.classList.toggle("is-active", item === button));
        applyFilters();
      }});
    }});
  </script>
</body>
</html>
""",
        encoding="utf-8",
    )


def paragraph(text, style=None):
    escaped = escape(text)
    style_xml = f"<w:pPr><w:pStyle w:val=\"{style}\"/></w:pPr>" if style else ""
    return f"<w:p>{style_xml}<w:r><w:t xml:space=\"preserve\">{escaped}</w:t></w:r></w:p>"


def write_docx(reports):
    status_totals = {"critical": 0, "high": 0, "warning": 0, "ok": 0}
    for report in reports:
        status_totals[report_status(report)] += 1
    overall_title, overall_detail = overall_status(status_totals)
    actions = next_actions(reports)
    body = [
        paragraph("Website Monitoring Report", "Title"),
        paragraph(f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"),
        paragraph(f"Overall status: {overall_title}", "Heading1"),
        paragraph(overall_detail),
        paragraph(
            f"Targets reviewed: {len(reports)}. Targets needing attention: "
            f"{status_totals['critical'] + status_totals['high'] + status_totals['warning']}. "
            f"Targets that look good: {status_totals['ok']}."
        ),
        paragraph("What to do next", "Heading1"),
    ]

    if actions:
        for action in actions:
            body.append(paragraph(f"{action['target']} - {action['title']}: {action['detail']}"))
    else:
        body.append(paragraph("Keep the current monitoring schedule and rerun scans after website or infrastructure changes."))

    body.append(paragraph("Monitored targets", "Heading1"))

    if not reports:
        body.append(paragraph("No downloaded reports were found."))
    else:
        for report in sorted_reports_by_priority(reports):
            status = report_status(report)
            body.append(paragraph(report["name"], "Heading2"))
            body.append(paragraph(f"Status: {status_label(status)}"))
            body.append(paragraph(status_message(status)))
            body.append(paragraph("Recommended actions", "Heading3"))
            for item in remediation_items(report):
                body.append(paragraph(f"{item['title']}: {item['detail']}"))
            if not report["files"]:
                body.append(paragraph("No files found in this artifact."))
                continue
            for file_info in report["files"]:
                body.append(paragraph(f"Raw scanner output: {file_info['relative_path']}", "Heading3"))
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
    write_html(reports)
    write_docx(reports)
    print(f"Generated {BUNDLE_DIR}/ with HTML, DOCX, Markdown, and raw reports.")


if __name__ == "__main__":
    main()
