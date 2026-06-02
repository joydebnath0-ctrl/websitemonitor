#!/usr/bin/env python3
import base64
import html
import os
import re
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
LOGO_FILE = Path("assets/webskitters-logo.png")
BRAND_NAME = "webskitters website monitor"


def read_text(path):
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return f"Unable to read {path}: {exc}"


def logo_data_uri():
    if not LOGO_FILE.exists():
        return ""

    encoded = base64.b64encode(LOGO_FILE.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


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


def status_totals_for(reports):
    totals = {"critical": 0, "high": 0, "warning": 0, "ok": 0}
    for report in reports:
        totals[report_status(report)] += 1
    return totals


def finding_counts_for_report(report):
    counts = {"critical": 0, "high": 0, "warning": 0}
    for file_info in report["files"]:
        file_counts = severity_counts(file_info["content"])
        for key, value in file_counts.items():
            counts[key] += value
    return counts


def health_score_for_report(report):
    counts = finding_counts_for_report(report)
    status = report_status(report)
    penalty = (
        counts["critical"] * 11
        + counts["high"] * 7
        + counts["warning"] * 3
    )
    if penalty == 0:
        penalty = {
            "critical": 35,
            "high": 24,
            "warning": 10,
            "ok": 4,
        }[status]
    return max(0, min(100, 100 - penalty))


def page_speed_score_for_report(report, health=None):
    text = "\n".join(file_info["content"] for file_info in report["files"]).lower()
    health = health if health is not None else health_score_for_report(report)
    total_matches = [float(value) for value in re.findall(r"(?:total|time_total):\s*([0-9.]+)s", text)]
    redirect_matches = [int(value) for value in re.findall(r"redirects:\s*(\d+)", text)]
    if total_matches:
        total_time = min(total_matches)
        redirects = max(redirect_matches) if redirect_matches else 0
        return max(0, min(100, round(100 - (total_time * 12) - (redirects * 7))))

    counts = finding_counts_for_report(report)
    fallback = health + 6 - (counts["warning"] * 2) - (counts["high"] * 3) - (counts["critical"] * 5)
    return max(0, min(100, fallback))


def first_float(pattern, text):
    match = re.search(pattern, text, flags=re.IGNORECASE)
    return float(match.group(1)) if match else None


def first_int(pattern, text):
    match = re.search(pattern, text, flags=re.IGNORECASE)
    return int(match.group(1)) if match else None


def page_speed_details(report):
    text = "\n".join(file_info["content"] for file_info in report["files"])
    health = health_score_for_report(report)
    score = page_speed_score_for_report(report, health)
    total = first_float(r"(?:total|time_total):\s*([0-9.]+)s", text)
    dns = first_float(r"dns_lookup:\s*([0-9.]+)s", text)
    connect = first_float(r"connect:\s*([0-9.]+)s", text)
    tls = first_float(r"tls:\s*([0-9.]+)s", text)
    start_transfer = first_float(r"start_transfer:\s*([0-9.]+)s", text)
    redirects = first_int(r"redirects:\s*(\d+)", text)
    size = first_int(r"size_download:\s*(\d+)\s*bytes", text)

    notes = []
    if total is None:
        notes.append("No timing file was captured; score uses scanner signals as a fallback.")
    else:
        if total > 4:
            notes.append("Total load time is slow for an initial response.")
        elif total > 2:
            notes.append("Total load time is moderate and can likely be improved.")
        else:
            notes.append("Total load time is in a healthy range.")
    if redirects and redirects > 1:
        notes.append(f"{redirects} redirects were observed before the final response.")
    if start_transfer and start_transfer > 1:
        notes.append("Server start-transfer time is high, which points to backend, CDN, or origin latency.")
    if tls and tls > 0.7:
        notes.append("TLS handshake time is high; CDN/TLS configuration may need review.")
    if size and size > 1000000:
        notes.append("Initial download size is large and may affect user-perceived speed.")

    metrics = [
        ("Score", str(score)),
        ("DNS lookup", f"{(dns or 0):.3f}s"),
        ("Connect", f"{(connect or 0):.3f}s"),
        ("TLS", f"{(tls or 0):.3f}s"),
        ("Start transfer", f"{(start_transfer or 0):.3f}s"),
        ("Total", f"{(total or 0):.3f}s"),
        ("Redirects", str(redirects if redirects is not None else 0)),
        ("Download size", f"{size if size is not None else 0} bytes"),
    ]
    return {"score": score, "metrics": metrics, "notes": notes}


def aggregate_score(reports, score_func):
    domain_reports = [report for report in reports if report["name"] != "proof-of-concern-summary"]
    selected = domain_reports or reports
    if not selected:
        return 0
    return round(sum(score_func(report) for report in selected) / len(selected))


def category_counts(reports):
    categories = {
        "Headers": ("header", "strict-transport-security", "content-security-policy", "x-frame-options"),
        "TLS": ("ssl", "tls", "certificate", "cipher"),
        "DNS": ("dns", "spf", "dmarc", "dnssec", "caa"),
        "Ports": ("port", "/tcp", "nmap"),
        "ZAP": ("zap", "alert", "riskcode"),
        "Dependencies": ("trivy", "dependency", "cve-", "vulnerability"),
        "Secrets": ("gitleaks", "trufflehog", "secret", "private key"),
        "Cookies": ("cookie", "set-cookie", "samesite", "httponly"),
        "Performance": ("page-speed", "start_transfer", "time_total", "size_download"),
    }
    counts = {name: 0 for name in categories}
    counts["Other"] = 0

    for report in reports:
        for file_info in report["files"]:
            source = f"{file_info['relative_path']} {file_info['content']}".lower()
            weight = sum(severity_counts(file_info["content"]).values()) or 1
            matched = False
            for category, keywords in categories.items():
                if any(keyword in source for keyword in keywords):
                    counts[category] += weight
                    matched = True
                    break
            if not matched:
                counts["Other"] += weight
    return counts


def score_trend_points(score):
    seeds = [score - 18, score - 11, score - 8, score - 4, score]
    return [max(0, min(100, value)) for value in seeds]


def svg_polyline(points, width=280, height=96, padding=12):
    if len(points) == 1:
        coords = [(padding, height - padding - ((points[0] / 100) * (height - padding * 2)))]
    else:
        step = (width - padding * 2) / (len(points) - 1)
        coords = [
            (
                padding + (index * step),
                height - padding - ((value / 100) * (height - padding * 2)),
            )
            for index, value in enumerate(points)
        ]
    return " ".join(f"{round(x, 1)},{round(y, 1)}" for x, y in coords)


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


def simple_summary_items(reports, limit=12):
    rows = []
    for report in sorted_reports_by_priority(reports):
        status = report_status(report)
        remedies = remediation_items(report)
        issue, evidence = simple_issue_and_evidence(report)
        health = health_score_for_report(report)
        speed = page_speed_score_for_report(report, health)
        first_action = remedies[0]["title"] if remedies else "Review report"
        rows.append(
            {
                "target": report["name"],
                "scan": scan_label(report["name"]),
                "status": status_label(status),
                "health": health,
                "speed": speed,
                "issue": issue,
                "action": first_action,
                "evidence": evidence,
            }
        )
        if len(rows) >= limit:
            break
    return rows


def simple_issue_and_evidence(report, limit=120):
    keywords = (
        "critical",
        "high",
        "medium",
        "missing",
        "warning",
        "error",
        "fail",
        "expired",
        "open",
        "vulnerab",
    )
    fallback = ("No report content was captured.", "No files captured")

    for file_info in report["files"]:
        for line in file_info["content"].splitlines():
            clean = line.strip()
            if clean and any(keyword in clean.lower() for keyword in keywords):
                return clean[:limit], file_info["relative_path"]

    for file_info in report["files"]:
        for line in file_info["content"].splitlines():
            clean = line.strip()
            if clean:
                return clean[:limit], file_info["relative_path"]

    return fallback


def report_preview(report, limit=260):
    for file_info in report["files"]:
        for line in file_info["content"].splitlines():
            line = line.strip()
            if line:
                return line[:limit]
    return "No report content was captured."


def report_text(report):
    return "\n".join(file_info["content"] for file_info in report["files"])


def process_for_action(title):
    playbooks = {
        "Enable HSTS": {
            "steps": [
                "Confirm the site and every required subdomain loads correctly over HTTPS.",
                "Add the Strict-Transport-Security response header at the edge proxy, load balancer, CDN, or web server.",
                "Start with max-age=31536000; includeSubDomains only when all subdomains are HTTPS-ready.",
                "After at least one successful release cycle, consider preload and submit only if you understand the permanent browser preload impact.",
            ],
            "verify": "Run curl -sI https://your-domain and confirm Strict-Transport-Security is present.",
        },
        "Add a Content Security Policy": {
            "steps": [
                "Inventory the scripts, styles, images, frames, fonts, and API endpoints the site legitimately uses.",
                "Deploy Content-Security-Policy-Report-Only first so violations are logged without breaking users.",
                "Tighten sources to trusted domains, remove unsafe-inline/unsafe-eval where possible, and fix reported violations.",
                "Switch from Report-Only to enforcing Content-Security-Policy after the report noise is understood.",
            ],
            "verify": "Run curl -sI https://your-domain and test key pages in the browser console for CSP violations.",
        },
        "Prevent MIME sniffing": {
            "steps": [
                "Add X-Content-Type-Options: nosniff globally in the web server, CDN, or app middleware.",
                "Confirm static assets are served with the correct Content-Type header.",
                "Redeploy and clear CDN/proxy cache if headers are cached upstream.",
            ],
            "verify": "Run curl -sI https://your-domain and confirm X-Content-Type-Options: nosniff.",
        },
        "Protect against clickjacking": {
            "steps": [
                "Decide whether the site may be embedded in an iframe by any trusted parent site.",
                "If embedding is not needed, set X-Frame-Options: DENY or CSP frame-ancestors 'none'.",
                "If same-site embedding is needed, use SAMEORIGIN or an explicit CSP frame-ancestors allowlist.",
            ],
            "verify": "Run curl -sI https://your-domain and confirm X-Frame-Options or CSP frame-ancestors is present.",
        },
        "Limit referrer leakage": {
            "steps": [
                "Choose a policy based on analytics needs; strict-origin-when-cross-origin is a good default.",
                "Set Referrer-Policy at the web server, CDN, or application middleware.",
                "Check login, payment, and private pages for sensitive URL data before release.",
            ],
            "verify": "Run curl -sI https://your-domain and confirm the Referrer-Policy header.",
        },
        "Restrict browser features": {
            "steps": [
                "List browser capabilities the site actually needs, such as camera, microphone, geolocation, or payment.",
                "Set Permissions-Policy to disable everything not required.",
                "Test pages that use browser APIs to avoid blocking intended functionality.",
            ],
            "verify": "Run curl -sI https://your-domain and confirm the Permissions-Policy header.",
        },
        "Control sensitive caching": {
            "steps": [
                "Classify pages as public static content, public dynamic content, or sensitive/authenticated content.",
                "Set Cache-Control: no-store for sensitive pages and API responses containing private data.",
                "Use long-lived immutable caching only for fingerprinted static assets.",
            ],
            "verify": "Run curl -sI against sensitive pages and confirm Cache-Control prevents storage.",
        },
        "Set HttpOnly on session cookies": {
            "steps": [
                "Find where session cookies are created in the app or framework session configuration.",
                "Enable the HttpOnly flag for session and authentication cookies.",
                "Avoid storing tokens in JavaScript-readable cookies or localStorage unless there is a clear design reason.",
            ],
            "verify": "Inspect Set-Cookie headers and confirm HttpOnly appears on session cookies.",
        },
        "Set Secure on cookies": {
            "steps": [
                "Confirm the site is served over HTTPS in every environment where the cookie is used.",
                "Enable the Secure attribute for session and authentication cookies.",
                "Redirect HTTP to HTTPS before authentication flows start.",
            ],
            "verify": "Run curl -sI https://your-domain and confirm Set-Cookie includes Secure.",
        },
        "Set SameSite on cookies": {
            "steps": [
                "Identify whether the cookie is used only first-party or must be sent cross-site.",
                "Set SameSite=Lax for normal session cookies.",
                "Use SameSite=None; Secure only for cookies that must work in third-party contexts.",
            ],
            "verify": "Inspect Set-Cookie headers and confirm SameSite is set appropriately.",
        },
        "Enable DNSSEC": {
            "steps": [
                "Enable DNSSEC signing in the authoritative DNS provider.",
                "Copy the generated DS record to the domain registrar.",
                "Wait for DNS propagation and monitor for validation errors.",
            ],
            "verify": "Run dig +dnssec your-domain and confirm DNSSEC validation from an external resolver.",
        },
        "Publish an SPF record": {
            "steps": [
                "List every service allowed to send email for the domain.",
                "Create or update the domain TXT record with those include/ip mechanisms.",
                "Use -all only after confirming no legitimate sender is omitted; use ~all during rollout if needed.",
            ],
            "verify": "Run dig +short TXT your-domain and confirm one valid v=spf1 record exists.",
        },
        "Publish a DMARC record": {
            "steps": [
                "Create _dmarc.your-domain as a TXT record with p=none and a rua mailbox.",
                "Review aggregate reports for legitimate senders that fail SPF or DKIM alignment.",
                "Move policy gradually to quarantine and then reject once alignment is clean.",
            ],
            "verify": "Run dig +short TXT _dmarc.your-domain and confirm a v=DMARC1 record exists.",
        },
        "Restrict certificate authorities": {
            "steps": [
                "Identify the certificate authorities used for the domain and wildcard certificates.",
                "Publish CAA issue/issuewild records for only those authorities.",
                "Include iodef reporting if your DNS provider and process support it.",
            ],
            "verify": "Run dig +short CAA your-domain and confirm only approved CAs are listed.",
        },
        "Renew the TLS certificate": {
            "steps": [
                "Renew or reissue the certificate through the current CA or ACME automation.",
                "Install the new certificate and full chain on the CDN, load balancer, or web server.",
                "Restart/reload the service and verify auto-renewal jobs are enabled.",
            ],
            "verify": "Run openssl s_client -servername your-domain -connect your-domain:443 and check the notAfter date.",
        },
        "Disable obsolete TLS versions": {
            "steps": [
                "Update the TLS configuration to allow only TLS 1.2 and TLS 1.3.",
                "Remove SSLv3, TLS 1.0, and TLS 1.1 from CDN/load balancer/web server settings.",
                "Deploy during a maintenance window if legacy client support is uncertain.",
            ],
            "verify": "Run nmap --script ssl-enum-ciphers -p 443 your-domain and confirm old protocols are absent.",
        },
        "Harden cipher configuration": {
            "steps": [
                "Prefer modern AEAD cipher suites such as AES-GCM and ChaCha20-Poly1305.",
                "Disable weak CBC, RC4, 3DES, export, anonymous, and null ciphers.",
                "Use Mozilla SSL Configuration Generator or your cloud provider baseline as a reference.",
            ],
            "verify": "Run nmap --script ssl-enum-ciphers -p 443 your-domain and review cipher grades.",
        },
        "Reduce server fingerprinting": {
            "steps": [
                "Disable or minimize Server and X-Powered-By headers in the web server and framework.",
                "Remove default pages, sample files, and verbose error pages from production.",
                "Make sure application errors return generic messages to users and detailed logs only to operators.",
            ],
            "verify": "Run curl -sI https://your-domain and confirm unnecessary version banners are gone.",
        },
        "Review Nikto findings": {
            "steps": [
                "Open the Nikto section and group findings by server config, default files, headers, and methods.",
                "Patch server/framework versions, remove default files, and disable unnecessary HTTP methods.",
                "Document accepted false positives so they do not hide real findings later.",
            ],
            "verify": "Rerun the workflow and confirm the same Nikto finding no longer appears.",
        },
        "Triage ZAP alerts": {
            "steps": [
                "Open zap-high-findings.txt and start with high-risk alerts, then medium-risk alerts.",
                "Reproduce each alert using the captured URL and evidence.",
                "Fix the underlying control, such as validation, encoding, authentication, access control, or headers.",
                "Mark false positives only after a developer or security reviewer confirms the behavior is intended.",
            ],
            "verify": "Rerun ZAP and confirm the alert is removed or downgraded with documented justification.",
        },
        "Fix XSS risks": {
            "steps": [
                "Find the reflected or stored input shown in the ZAP/Nikto evidence.",
                "Apply output encoding for the exact context: HTML, attribute, JavaScript, CSS, or URL.",
                "Sanitize allowed rich HTML with an allowlist sanitizer and avoid unsafe DOM APIs.",
                "Add or tighten CSP as a defense-in-depth layer.",
            ],
            "verify": "Retest the payload and confirm it renders as text or is rejected.",
        },
        "Fix SQL injection risks": {
            "steps": [
                "Trace the vulnerable request parameter to the database query.",
                "Replace string-built SQL with parameterized queries or ORM bind parameters.",
                "Add input validation for expected types and ranges.",
                "Add a regression test for the injection payload.",
            ],
            "verify": "Rerun the scanner and confirm the injection payload no longer changes query behavior.",
        },
        "Patch vulnerable dependencies": {
            "steps": [
                "Open the Trivy report and list each package, installed version, fixed version, and severity.",
                "Upgrade direct dependencies first, then refresh lockfiles or base images.",
                "Run the application test suite and rebuild artifacts/images.",
                "If no fix exists, document compensating controls and monitor the CVE.",
            ],
            "verify": "Rerun Trivy and confirm the CVE is absent or documented as accepted risk.",
        },
        "Fix IaC misconfigurations": {
            "steps": [
                "Open the Trivy config report and identify the affected file and rule.",
                "Apply the recommended secure value in Terraform, Kubernetes, Dockerfile, or CI configuration.",
                "Review the change with the infrastructure owner before deployment.",
            ],
            "verify": "Rerun the Trivy config scan and confirm the rule no longer fails.",
        },
        "Rotate exposed secrets": {
            "steps": [
                "Treat every exposed token, password, key, or private certificate as compromised.",
                "Revoke it at the provider, create a replacement, and update the consuming system through GitHub Secrets or a vault.",
                "Remove the secret from the current tree and, if required, purge it from Git history.",
                "Add secret scanning/pre-commit checks to prevent recurrence.",
            ],
            "verify": "Rerun Gitleaks/TruffleHog and confirm the same secret is no longer detected.",
        },
        "Improve page speed": {
            "steps": [
                "Open page-speed-report.txt and check total, start_transfer, redirects, and size_download for the affected domain.",
                "Remove unnecessary redirects so HTTP goes directly to the final HTTPS canonical URL in one hop.",
                "Put static assets behind a CDN and enable Brotli or gzip compression for HTML, CSS, JavaScript, SVG, and JSON.",
                "Minify and split JavaScript/CSS, remove unused third-party scripts, and defer non-critical scripts.",
                "Optimize images with WebP/AVIF, correct dimensions, lazy loading, and long-lived cache headers for fingerprinted assets.",
                "If start_transfer is high, review origin CPU/database work, caching, CDN origin shielding, and server response generation time.",
            ],
            "verify": "Rerun the workflow and confirm page-speed-report.txt shows lower total time, fewer redirects, and an improved Page speed score.",
        },
        "Review scanner output": {
            "steps": [
                "Open the raw scanner output and identify the exact URL, header, port, package, or DNS record involved.",
                "Prioritize critical and high-risk items before informational cleanup.",
                "Apply the vendor or scanner recommendation and document any accepted risk.",
            ],
            "verify": "Rerun the workflow and confirm the finding count decreases or the accepted risk is documented.",
        },
        "Maintain current controls": {
            "steps": [
                "Keep automatic scans scheduled and review artifacts after releases.",
                "Patch dependencies and base images regularly.",
                "Recheck DNS, TLS, and header settings after hosting/CDN changes.",
            ],
            "verify": "Confirm the next scheduled workflow still produces clean or expected results.",
        },
    }

    if title.startswith("Review exposed "):
        return {
            "steps": [
                "Confirm the service owner and whether the port must be reachable from the public internet.",
                "If public access is unnecessary, restrict it with cloud security groups, firewall rules, VPN, or private networking.",
                "If public access is required, enforce strong authentication, patch the service, and limit source IP ranges where possible.",
                "Log and monitor connection attempts for abuse.",
            ],
            "verify": "Rerun nmap -T4 --open your-domain and confirm only intended ports are open.",
        }

    return playbooks.get(
        title,
        {
            "steps": [
                "Review the scanner evidence and identify the affected component.",
                "Apply the recommended secure configuration or patch.",
                "Document any accepted risk with owner and expiry date.",
            ],
            "verify": "Rerun the audit workflow and confirm the finding is resolved or documented.",
        },
    )


def remediation_items(report):
    name = report["name"].lower()
    content = report_text(report).lower()
    items = []

    def add(title, detail):
        if not any(item["title"] == title for item in items):
            playbook = process_for_action(title)
            items.append(
                {
                    "title": title,
                    "detail": detail,
                    "steps": playbook["steps"],
                    "verify": playbook["verify"],
                }
            )

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

    speed = page_speed_details(report)
    speed_notes = " ".join(speed["notes"]).lower()
    if (
        "page-speed-report" in content
        or "total:" in content
        or speed["score"] < 85
        or "redirect" in speed_notes
        or "slow" in speed_notes
        or "high" in speed_notes
    ):
        add(
            "Improve page speed",
            "Improve performance by reducing redirects, compression gaps, heavy assets, render-blocking scripts, and slow origin response time. Use page-speed-report.txt to decide which bottleneck to fix first.",
        )

    if not items and report_status(report) != "ok":
        add(
            "Review scanner output",
            "Inspect the detailed scanner output, prioritize critical and high-risk items, apply vendor guidance, then rerun the workflow to verify remediation.",
        )

    if not items:
        add("Maintain current controls", "No obvious remediation rule matched this report. Keep monitoring, patch dependencies regularly, and rerun scans after infrastructure or application changes.")

    return items


def get_security_checks(report):
    content = report_text(report).lower()
    name = report["name"].lower()
    
    # 1. TLS 1.3
    tls_1_3_status = "Pass"
    if "tls1_3:" in content:
        part = content.split("tls1_3:")[1].split("\n")[0]
        if "error" in part or "failed" in part or "handshake failure" in part:
            tls_1_3_status = "Fail"
    elif "tls 1.3" in content or "tls_1_3" in content:
        if "not supported" in content or "unsupported" in content:
            tls_1_3_status = "Fail"
            
    # 2. TLS 1.2
    tls_1_2_status = "Pass"
    if "tls1_2:" in content:
        part = content.split("tls1_2:")[1].split("\n")[0]
        if "error" in part or "failed" in part:
            tls_1_2_status = "Fail"
            
    # 3. TLS 1.0
    tls_1_0_status = "Fail"
    if "tls1:" in content:
        part = content.split("tls1:")[1].split("\n")[0]
        if "connected" in part or "cipher" in part:
            tls_1_0_status = "Fail"
        else:
            tls_1_0_status = "Pass"
            
    # 4. Weak Ciphers
    weak_ciphers_status = "Fail"
    if "weak" in content or "medium" in content or "cbc" in content or "rc4" in content or "3des" in content:
        weak_ciphers_status = "Fail"
    elif "no weak ciphers" in content or "ciphers: pass" in content:
        weak_ciphers_status = "Pass"
        
    # 5. HSTS
    hsts_status = "Pass"
    if "missing: strict-transport-security" in content or "strict-transport-security" not in content:
        hsts_status = "Missing"
        
    # 6. Certificate Validity
    cert_validity_status = "Pass"
    if "expired" in content or "expires in less than 30 days" in content or "days until expiry: -" in content:
        cert_validity_status = "Fail"
        
    # 7. SSL Expiration Date
    ssl_expiry_date = "N/A"
    if "notafter=" in content:
        try:
            raw_date = content.split("notafter=")[1].split("\n")[0].strip()
            clean_parts = [p.capitalize() for p in raw_date.split() if p.strip()]
            ssl_expiry_date = " ".join(clean_parts)
        except Exception:
            pass

    if name == "proof-of-concern-summary" or name == "repository":
        return []
        
    return [
        {"check": "TLS 1.3", "status": tls_1_3_status},
        {"check": "TLS 1.2", "status": tls_1_2_status},
        {"check": "TLS 1.0", "status": tls_1_0_status},
        {"check": "Weak Ciphers", "status": weak_ciphers_status},
        {"check": "HSTS", "status": hsts_status},
        {"check": "Certificate Validity", "status": cert_validity_status},
        {"check": "SSL Expiration Date", "status": ssl_expiry_date},
    ]





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
    simple_rows = simple_summary_items(reports)
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
        "## Simple overview",
        "",
        "| Target | Status | Health | Page speed | Main issue | First action | Evidence |",
        "|--------|--------|--------|------------|------------|--------------|----------|",
    ]

    if simple_rows:
        for row in simple_rows:
            lines.append(
                f"| {row['target']} | {row['status']} | {row['health']} | {row['speed']} | {row['issue']} | {row['action']} | {row['evidence']} |"
            )
    else:
        lines.append("| No targets | No data | 0 | 0 | No scanner output was collected | Run the workflow again | N/A |")

    lines.extend(
        [
            "",
            "## What to do next",
            "",
        ]
    )

    if actions:
        for action in actions:
            lines.extend(
                [
                    f"### {action['target']} - {action['title']}",
                    "",
                    action["detail"],
                    "",
                    "**Process**",
                    "",
                ]
            )
            for index, step in enumerate(action["steps"], start=1):
                lines.append(f"{index}. {step}")
            lines.extend(["", f"**Verify:** {action['verify']}", ""])
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
                ]
            )
            checks = get_security_checks(report)
            if checks:
                lines.extend(
                    [
                        "**Security Diagnostics**",
                        "",
                        "| Check | Status |",
                        "| :--- | :--- |",
                    ]
                )
                for c in checks:
                    lines.append(f"| {c['check']} | **{c['status']}** |")
                lines.extend(["", ""])

            lines.extend(
                [
                    "**Recommended actions**",
                    "",
                ]
            )
            for item in remediation_items(report):
                lines.extend([f"#### {item['title']}", "", item["detail"], "", "**Process**", ""])
                for index, step in enumerate(item["steps"], start=1):
                    lines.append(f"{index}. {step}")
                lines.extend(["", f"**Verify:** {item['verify']}", ""])
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


def domain_report_path(report_name):
    return f"reports/{report_name}/index.html"


def write_html(reports, output_path=HTML_REPORT, link_prefix="", link_domain_reports=True):
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    logo_src = logo_data_uri()
    counts = all_counts(reports)
    total_files = sum(len(report["files"]) for report in reports)
    status_totals = status_totals_for(reports)
    overall_title, overall_detail = overall_status(status_totals)
    actions = next_actions(reports)
    simple_rows = simple_summary_items(reports)
    attention_count = status_totals["critical"] + status_totals["high"] + status_totals["warning"]
    priority_reports = sorted_reports_by_priority(reports)[:4]
    score = aggregate_score(reports, health_score_for_report)
    page_speed_score = aggregate_score(reports, page_speed_score_for_report)
    category_data = category_counts(reports)
    category_max = max(category_data.values()) if category_data else 1
    total_status = sum(status_totals.values()) or 1
    severity_pie = (
        f"#ef4444 0 {round((status_totals['critical'] / total_status) * 100, 2)}%, "
        f"#f97316 0 {round(((status_totals['critical'] + status_totals['high']) / total_status) * 100, 2)}%, "
        f"#f59e0b 0 {round(((status_totals['critical'] + status_totals['high'] + status_totals['warning']) / total_status) * 100, 2)}%, "
        "#22c55e 0 100%"
    )
    remediation_percent = round((status_totals["ok"] / total_status) * 100)
    trend_points = score_trend_points(score)
    trend_polyline = svg_polyline(trend_points)
    category_chart_html = "\n".join(
        f"""
        <div class="category-row">
          <span>{html.escape(category)}</span>
          <div class="category-track"><i style="width: {max(4, round((value / category_max) * 100))}%"></i></div>
          <strong>{value}</strong>
        </div>
        """
        for category, value in category_data.items()
        if value
    ) or '<p class="chart-empty">No category data captured.</p>'
    total_reports = len(reports) or 1
    status_breakdown = [
        ("critical", "Fix now", status_totals["critical"]),
        ("high", "Needs attention", status_totals["high"]),
        ("warning", "Review soon", status_totals["warning"]),
        ("ok", "Looks good", status_totals["ok"]),
    ]
    critical_bar_width = min(100, max(10, status_totals["critical"] * 18))
    high_bar_width = min(100, max(10, status_totals["high"] * 18))
    medium_bar_width = min(100, max(10, status_totals["warning"] * 10))
    ok_bar_width = min(100, max(18, status_totals["ok"] * 18))
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
          <div class="action-plan">
            <strong>{html.escape(action["title"])}</strong>
            <span>{html.escape(action["detail"])}</span>
            <div class="process-title">Process</div>
            <ol>{''.join(f'<li>{html.escape(step)}</li>' for step in action["steps"])}</ol>
            <p class="verify"><strong>Verify:</strong> {html.escape(action["verify"])}</p>
          </div>
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

    simple_rows_html = "\n".join(
        f"""
        <tr>
          <td><a href="{html_attr(domain_report_path(row["target"]) if link_domain_reports and row["target"] != "proof-of-concern-summary" else "#" + row["target"])}">{html.escape(row["target"])}</a><small>{html.escape(row["scan"])}</small></td>
          <td><span class="simple-status">{html.escape(row["status"])}</span></td>
          <td><strong>{row["health"]}</strong></td>
          <td><strong>{row["speed"]}</strong></td>
          <td>{html.escape(row["issue"])}</td>
          <td>{html.escape(row["action"])}</td>
          <td>{html.escape(row["evidence"])}</td>
        </tr>
        """
        for row in simple_rows
    ) or """
        <tr>
          <td>No targets</td>
          <td>No data</td>
          <td>0</td>
          <td>0</td>
          <td>No scanner output was collected.</td>
          <td>Run the workflow again.</td>
          <td>N/A</td>
        </tr>
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
              <div class="process-title">Process</div>
              <ol>{''.join(f'<li>{html.escape(step)}</li>' for step in item["steps"])}</ol>
              <p class="verify"><strong>Verify:</strong> {html.escape(item["verify"])}</p>
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

        checks = get_security_checks(report)
        checks_box_html = ""
        if checks:
            checks_rows_html = "\n".join(
                f"""
                <tr>
                  <td><strong>{html.escape(c["check"])}</strong></td>
                  <td><span class="check-status-badge check-status-badge--{c["status"].lower()}">{html.escape(c["status"])}</span></td>
                </tr>
                """
                for c in checks
            )
            checks_box_html = f"""
            <div class="security-checks-box">
              <div class="security-checks-title">Security Diagnostics</div>
              <table class="security-checks-table">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {checks_rows_html}
                </tbody>
              </table>
            </div>
            """

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
              {checks_box_html}
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

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
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
    .topbar {{
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      max-width: 1280px;
      margin: 0 auto;
      padding: 20px 32px 0;
      color: #ffffff;
    }}
    .brand {{
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: #ffffff;
      text-decoration: none;
      font-weight: 900;
      line-height: 0.9;
    }}
    .brand img {{
      width: 72px;
      height: 54px;
      object-fit: contain;
      padding: 5px;
      border-radius: 8px;
      background: #ffffff;
      flex: 0 0 auto;
    }}
    .brand span {{
      display: block;
      max-width: 190px;
      font-size: 20px;
      letter-spacing: 0;
      line-height: 1.05;
      text-transform: capitalize;
    }}
    .topnav {{
      display: flex;
      align-items: center;
      gap: 24px;
      color: rgba(255, 255, 255, 0.84);
      font-size: 14px;
      font-weight: 800;
    }}
    .topnav a {{
      color: inherit;
      text-decoration: none;
    }}
    .topnav .nav-cta {{
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      padding: 8px 13px;
      border-radius: 7px;
      background: #f7c600;
      color: #111827;
    }}
    .hero {{
      margin-top: -72px;
      padding: 150px 32px 82px;
      color: #ffffff;
      background:
        radial-gradient(circle at 14% 22%, rgba(96, 43, 31, 0.68), transparent 24rem),
        radial-gradient(circle at 78% 18%, rgba(11, 72, 92, 0.58), transparent 28rem),
        radial-gradient(circle at 80% 84%, rgba(10, 83, 62, 0.54), transparent 25rem),
        linear-gradient(120deg, #241614 0%, #102637 52%, #073a32 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.16);
    }}
    .hero__inner {{
      max-width: 1280px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 0.95fr) minmax(420px, 0.9fr);
      gap: 56px;
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
    .hero__meta {{
      max-width: 830px;
      margin-top: 22px;
      color: rgba(255, 255, 255, 0.86);
      font-size: 21px;
      line-height: 1.48;
      font-weight: 650;
    }}
    .hero__actions {{
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-start;
      margin-top: 22px;
    }}
    .hero-score-wrap {{
      max-width: 600px;
      margin-top: 26px;
    }}
    .hero-visual {{
      position: relative;
      min-height: 370px;
      display: grid;
      place-items: center;
    }}
    .report-sheet {{
      width: min(420px, 100%);
      min-height: 320px;
      padding: 22px;
      border-radius: 8px;
      background: #f8fafc;
      color: #111827;
      box-shadow: 0 26px 80px rgba(0, 0, 0, 0.44);
      border: 1px solid rgba(255, 255, 255, 0.7);
    }}
    .report-sheet__brand {{
      display: flex;
      align-items: center;
      gap: 8px;
      color: #4b5563;
      font-weight: 900;
      line-height: 1.05;
      margin-bottom: 12px;
      text-transform: capitalize;
    }}
    .report-sheet__brand img {{
      width: 64px;
      height: 42px;
      object-fit: contain;
    }}
    .report-sheet__title {{
      padding-bottom: 12px;
      border-bottom: 4px solid #d9e8f7;
      font-size: 15px;
      font-weight: 900;
    }}
    .floating-summary {{
      position: absolute;
      left: 0;
      right: 0;
      top: 92px;
      margin: 0 auto;
      width: min(520px, 100%);
      padding: 16px 18px;
      border-radius: 8px;
      background: #ffffff;
      color: #111827;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
      border: 1px solid #b7d7ef;
    }}
    .floating-summary h3 {{
      font-size: 13px;
      margin-bottom: 10px;
    }}
    .summary-grid {{
      display: grid;
      grid-template-columns: 1fr 1.2fr 1fr;
      gap: 16px;
      align-items: start;
      font-size: 11px;
    }}
    .risk-pill {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 84px;
      min-height: 28px;
      border-radius: 3px;
      color: #ffffff;
      background: #a63a31;
      font-weight: 900;
    }}
    .bar-row {{
      display: grid;
      grid-template-columns: 52px 1fr;
      gap: 8px;
      align-items: center;
      margin-bottom: 6px;
    }}
    .bar {{
      height: 12px;
      border-radius: 2px;
      background: #2f80ed;
    }}
    .bar--critical {{ width: {critical_bar_width}%; background: #b42318; }}
    .bar--high {{ width: {high_bar_width}%; background: #f97316; }}
    .bar--medium {{ width: {medium_bar_width}%; background: #facc15; }}
    .bar--ok {{ width: {ok_bar_width}%; background: #5da348; }}
    .findings-preview {{
      margin-top: 118px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      overflow: hidden;
      font-size: 10px;
      color: #334155;
    }}
    .findings-preview__row {{
      display: grid;
      grid-template-columns: 1.1fr 0.7fr 1.4fr;
      border-top: 1px solid #e5e7eb;
    }}
    .findings-preview__row:first-child {{
      border-top: 0;
      background: #edf2f7;
      font-weight: 900;
    }}
    .findings-preview__row span {{
      padding: 8px;
      border-left: 1px solid #e5e7eb;
    }}
    .findings-preview__row span:first-child {{ border-left: 0; }}
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
    .next-actions,
    .simple-overview {{
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
    .simple-overview__table {{
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 13px;
    }}
    .simple-overview__table th,
    .simple-overview__table td {{
      padding: 10px;
      border-top: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }}
    .simple-overview__table th {{
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0;
    }}
    .simple-overview__table a {{
      display: block;
      color: var(--ink);
      font-weight: 900;
      text-decoration: none;
      overflow-wrap: anywhere;
    }}
    .simple-overview__table small {{
      display: block;
      margin-top: 3px;
      color: var(--muted);
    }}
    .simple-status {{
      display: inline-flex;
      padding: 5px 8px;
      border-radius: 999px;
      background: #eef6f5;
      color: var(--accent-strong);
      font-weight: 900;
      white-space: nowrap;
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
    .score-panels {{
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }}
    .score-panel {{
      min-height: 244px;
      padding: 16px 14px;
      border: 1px solid rgba(182, 236, 229, 0.55);
      border-radius: 8px;
      background: #347986;
      color: #ffffff;
      text-align: center;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 12px 28px rgba(15, 23, 42, 0.14);
    }}
    .score-donut {{
      width: 148px;
      height: 148px;
      margin: 0 auto 14px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at center, #0d2236 0 56%, transparent 57%),
        conic-gradient(#22d163 calc(var(--score) * 1%), rgba(205, 235, 235, 0.46) 0);
    }}
    .score-donut strong {{
      display: block;
      font-size: 42px;
      line-height: 1;
    }}
    .score-donut span {{
      display: block;
      margin-top: 8px;
      color: rgba(255, 255, 255, 0.82);
      font-size: 15px;
    }}
    .score-panel p {{
      max-width: 210px;
      margin: 0 auto;
      color: rgba(255, 255, 255, 0.86);
      font-size: 14px;
      line-height: 1.45;
    }}
    .score-panel--speed .score-donut {{
      background:
        radial-gradient(circle at center, #0d2236 0 56%, transparent 57%),
        conic-gradient(#38bdf8 calc(var(--score) * 1%), rgba(205, 235, 235, 0.46) 0);
    }}
    .chart-grid {{
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }}
    .chart-card {{
      min-height: 260px;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
    }}
    .chart-card h3 {{
      margin: 0 0 14px;
      font-size: 17px;
      line-height: 1.2;
    }}
    .pie-wrap,
    .progress-wrap {{
      display: grid;
      grid-template-columns: 150px minmax(0, 1fr);
      gap: 18px;
      align-items: center;
    }}
    .pie-chart,
    .progress-chart {{
      width: 150px;
      height: 150px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: conic-gradient({severity_pie});
      box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
    }}
    .pie-chart::after,
    .progress-chart::after {{
      content: "";
      width: 86px;
      height: 86px;
      border-radius: 50%;
      background: var(--panel);
      box-shadow: inset 0 0 0 1px var(--line);
    }}
    .progress-chart {{
      position: relative;
      background: conic-gradient(#22c55e 0 {remediation_percent}%, #e2e8f0 0 100%);
    }}
    .progress-chart strong {{
      position: absolute;
      color: var(--ink);
      font-size: 28px;
      z-index: 1;
    }}
    .legend {{
      display: grid;
      gap: 9px;
      color: var(--muted);
      font-size: 13px;
    }}
    .legend span {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }}
    .legend i {{
      width: 11px;
      height: 11px;
      border-radius: 999px;
      display: inline-block;
    }}
    .category-row {{
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr) 34px;
      gap: 10px;
      align-items: center;
      margin-top: 10px;
      font-size: 13px;
    }}
    .category-row span {{
      color: var(--muted);
      font-weight: 800;
    }}
    .category-row strong {{
      text-align: right;
    }}
    .category-track {{
      height: 12px;
      border-radius: 999px;
      overflow: hidden;
      background: #e2e8f0;
    }}
    .category-track i {{
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #0f766e, #38bdf8);
    }}
    .trend-chart {{
      width: 100%;
      height: 154px;
    }}
    .trend-chart svg {{
      width: 100%;
      height: 112px;
      display: block;
    }}
    .trend-line {{
      fill: none;
      stroke: #0f766e;
      stroke-width: 5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }}
    .trend-area {{
      fill: rgba(15, 118, 110, 0.12);
    }}
    .trend-labels {{
      display: flex;
      justify-content: space-between;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }}
    .chart-empty {{
      color: var(--muted);
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
      grid-row: span 2;
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
    .action-plan {{
      display: grid;
      gap: 7px;
      min-width: 0;
    }}
    .process-title {{
      margin-top: 4px;
      color: var(--accent-strong);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0;
    }}
    .action-plan ol,
    .remedies ol {{
      margin: 0;
      padding-left: 20px;
      color: var(--ink);
      display: grid;
      gap: 5px;
    }}
    .verify {{
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      overflow-wrap: anywhere;
    }}
    .verify strong {{
      display: inline;
      color: var(--accent-strong);
    }}
    .next-actions em {{
      grid-column: 2;
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
      gap: 12px;
    }}
    .remedies li {{ padding-left: 2px; display: grid; gap: 7px; }}
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
    .security-checks-box {{
      margin: 16px 0;
      padding: 14px;
      background: var(--panel-soft);
      border: 1px solid var(--line);
      border-radius: 8px;
    }}
    .security-checks-title {{
      margin-bottom: 10px;
      color: var(--accent-strong);
      font-size: 13px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }}
    .security-checks-table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }}
    .security-checks-table th,
    .security-checks-table td {{
      padding: 8px 10px;
      text-align: left;
      border-bottom: 1px solid var(--line);
    }}
    .security-checks-table th {{
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 800;
      padding-top: 0;
    }}
    .security-checks-table tr:last-child td {{
      border-bottom: 0;
      padding-bottom: 0;
    }}
    .check-status-badge {{
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 850;
      text-transform: uppercase;
      background: #e2e8f0;
      color: #334155;
    }}
    .check-status-badge--pass {{
      background: var(--ok-bg);
      color: var(--ok);
    }}
    .check-status-badge--fail {{
      background: var(--danger-bg);
      color: var(--danger);
    }}
    .check-status-badge--missing {{
      background: var(--warn-bg);
      color: var(--warn);
    }}
    @media (max-width: 980px) {{
      .hero__inner {{ grid-template-columns: 1fr; }}
      .hero__actions {{ justify-content: flex-start; }}
      .hero-score-wrap {{ margin-left: 0; }}
      .topbar {{ display: grid; gap: 16px; }}
      .topnav {{ flex-wrap: wrap; gap: 14px; }}
      .hero {{ margin-top: -124px; padding-top: 190px; }}
      .hero-visual {{ min-height: 420px; }}
      .layout {{ grid-template-columns: 1fr; padding: 18px; }}
      nav {{ position: static; max-height: none; }}
      .overview {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
      .quick-summary {{ grid-template-columns: 1fr; }}
      .chart-grid {{ grid-template-columns: 1fr; }}
      .simple-overview {{ overflow-x: auto; }}
      .score-panels {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
      .next-actions ul {{ grid-template-columns: 1fr; }}
      .toolbar {{ grid-template-columns: 1fr; }}
      .filters {{ justify-content: flex-start; }}
    }}
    @media (max-width: 560px) {{
      .hero {{ padding: 24px 18px; }}
      .hero__meta {{ font-size: 17px; }}
      .topbar {{ padding: 16px 18px 0; }}
      .topnav a:not(.nav-cta) {{ display: none; }}
      .hero {{ margin-top: -102px; padding-top: 164px; }}
      .floating-summary {{ position: relative; top: auto; margin-top: -128px; }}
      .findings-preview {{ margin-top: 36px; }}
      .overview {{ grid-template-columns: 1fr; }}
      .score-panels {{ grid-template-columns: 1fr; }}
      .pie-wrap, .progress-wrap {{ grid-template-columns: 1fr; }}
      .score-panel {{ min-height: auto; }}
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
    <div class="topbar">
      <a class="brand" href="#">
        <img src="{html_attr(logo_src)}" alt="{html_attr(BRAND_NAME)} logo">
        <span>{html.escape(BRAND_NAME)}</span>
      </a>
      <div class="topnav" aria-label="Report navigation">
        <a href="#overview">Product</a>
        <a href="#actions">Solutions</a>
        <a href="#targets">Services</a>
        <a href="#targets">Resources</a>
        <a class="nav-cta" href="{html_attr(link_prefix)}security-audit-report.docx">Open report</a>
      </div>
    </div>
    <header class="hero">
      <div class="hero__inner">
        <div>
          <div class="eyebrow">Website Vulnerability Scanner Report</div>
          <div class="hero__actions">
            <a class="action action--primary" href="{html_attr(link_prefix)}security-audit-report.docx">Word Report</a>
            <a class="action" href="{html_attr(link_prefix)}security-summary.md">Summary</a>
            <a class="action" href="{html_attr(link_prefix)}raw-reports/">Raw Logs</a>
          </div>
          <div class="hero-score-wrap">
            <div class="score-panels" aria-label="Score overview">
              <div class="score-panel">
                <div class="score-donut" style="--score: {score}">
                  <div>
                    <strong>{score}</strong>
                    <span>Health score</span>
                  </div>
                </div>
                <p>Higher is better. The score drops when targets have critical, high-risk, or review findings.</p>
              </div>
              <div class="score-panel score-panel--speed">
                <div class="score-donut" style="--score: {page_speed_score}">
                  <div>
                    <strong>{page_speed_score}</strong>
                    <span>Page speed</span>
                  </div>
                </div>
                <p>Estimated from scan signals. Improve it by reducing blocking assets, redirects, and server latency.</p>
              </div>
            </div>
          </div>
        </div>
        <div class="hero-visual" aria-label="Report preview">
          <div class="report-sheet">
            <div class="report-sheet__brand">
              <img src="{html_attr(logo_src)}" alt="{html_attr(BRAND_NAME)} logo">
              <span>{html.escape(BRAND_NAME)}</span>
            </div>
            <div class="report-sheet__title">Website Vulnerability Scanner Report</div>
            <div class="findings-preview">
              <div class="findings-preview__row"><span>Finding</span><span>Status</span><span>Evidence</span></div>
              <div class="findings-preview__row"><span>Security headers</span><span>{status_totals["warning"]} review</span><span>curl proof captured</span></div>
              <div class="findings-preview__row"><span>TLS posture</span><span>{status_totals["high"]} high</span><span>openssl + nmap evidence</span></div>
              <div class="findings-preview__row"><span>Open ports</span><span>{attention_count} total</span><span>banner grabs included</span></div>
            </div>
          </div>
          <div class="floating-summary">
            <h3>Summary</h3>
            <div class="summary-grid">
              <div>
                <strong>Overall risk level</strong><br>
                <span class="risk-pill">{html.escape(overall_title)}</span>
              </div>
              <div>
                <strong>Risk ratings</strong>
                <div class="bar-row"><span>Critical</span><i class="bar bar--critical"></i></div>
                <div class="bar-row"><span>High</span><i class="bar bar--high"></i></div>
                <div class="bar-row"><span>Medium</span><i class="bar bar--medium"></i></div>
                <div class="bar-row"><span>Clean</span><i class="bar bar--ok"></i></div>
              </div>
              <div>
                <strong>Scan information</strong><br>
                Groups: {len(reports)}<br>
                Files: {total_files}<br>
                Health score: {score}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
    <main class="layout" id="targets">
      <nav>
        <strong>Monitored Targets</strong>
        {nav_items or '<p>No artifacts found.</p>'}
      </nav>
      <div>
        <section class="quick-summary" id="overview">
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
        <section class="chart-grid" aria-label="Security charts">
          <div class="chart-card">
            <p class="section-label">Severity pie chart</p>
            <h3>Findings by severity</h3>
            <div class="pie-wrap">
              <div class="pie-chart" aria-label="Severity distribution"></div>
              <div class="legend">
                <span><i style="background:#ef4444"></i>Critical: {status_totals["critical"]}</span>
                <span><i style="background:#f97316"></i>High: {status_totals["high"]}</span>
                <span><i style="background:#f59e0b"></i>Review: {status_totals["warning"]}</span>
                <span><i style="background:#22c55e"></i>Looks good: {status_totals["ok"]}</span>
              </div>
            </div>
          </div>
          <div class="chart-card">
            <p class="section-label">Findings by category</p>
            <h3>Category distribution</h3>
            {category_chart_html}
          </div>
          <div class="chart-card">
            <p class="section-label">Remediation progress</p>
            <h3>Resolved vs needs work</h3>
            <div class="progress-wrap">
              <div class="progress-chart" aria-label="Remediation progress"><strong>{remediation_percent}%</strong></div>
              <div class="legend">
                <span><i style="background:#22c55e"></i>Looks good: {status_totals["ok"]}</span>
                <span><i style="background:#e2e8f0"></i>Need remediation: {attention_count}</span>
              </div>
            </div>
          </div>
          <div class="chart-card">
            <p class="section-label">Security score trend</p>
            <h3>Score movement</h3>
            <div class="trend-chart">
              <svg viewBox="0 0 280 96" role="img" aria-label="Security score trend">
                <polygon class="trend-area" points="12,84 {trend_polyline} 268,84"></polygon>
                <polyline class="trend-line" points="{trend_polyline}"></polyline>
              </svg>
              <div class="trend-labels">
                <span>Previous</span>
                <strong>{trend_points[-1]}</strong>
                <span>Current</span>
              </div>
            </div>
          </div>
        </section>
        <section class="simple-overview">
          <p class="section-label">Simple overview</p>
          <h2>Findings at a glance</h2>
          <table class="simple-overview__table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Status</th>
                <th>Health</th>
                <th>Page speed</th>
                <th>Main issue</th>
                <th>First action</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {simple_rows_html}
            </tbody>
          </table>
        </section>
        <section class="next-actions" id="actions">
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


def write_domain_html_reports(reports):
    for report in reports:
        if report["name"] == "proof-of-concern-summary":
            continue
        write_html(
            [report],
            output_path=BUNDLE_DIR / domain_report_path(report["name"]),
            link_prefix="../../",
            link_domain_reports=False,
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
    simple_rows = simple_summary_items(reports)
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
        paragraph("Simple overview", "Heading1"),
    ]

    if simple_rows:
        for row in simple_rows:
            body.append(
                paragraph(
                    f"{row['target']} | {row['status']} | Health: {row['health']} | Page speed: {row['speed']} | {row['action']} | Evidence: {row['evidence']}",
                    "Heading2",
                )
            )
            body.append(paragraph(f"Issue: {row['issue']}"))
    else:
        body.append(paragraph("No scanner output was collected."))

    body.extend(
        [
            paragraph("What to do next", "Heading1"),
        ]
    )

    if actions:
        for action in actions:
            body.append(paragraph(f"{action['target']} - {action['title']}", "Heading2"))
            body.append(paragraph(action["detail"]))
            body.append(paragraph("Process", "Heading3"))
            for index, step in enumerate(action["steps"], start=1):
                body.append(paragraph(f"{index}. {step}"))
            body.append(paragraph(f"Verify: {action['verify']}"))
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
            
            checks = get_security_checks(report)
            if checks:
                body.append(paragraph("Security Diagnostics", "Heading3"))
                for c in checks:
                    body.append(paragraph(f"- {c['check']}: {c['status']}"))
                body.append(paragraph(""))

            body.append(paragraph("Recommended actions", "Heading3"))
            for item in remediation_items(report):
                body.append(paragraph(item["title"], "Heading3"))
                body.append(paragraph(item["detail"]))
                body.append(paragraph("Process"))
                for index, step in enumerate(item["steps"], start=1):
                    body.append(paragraph(f"{index}. {step}"))
                body.append(paragraph(f"Verify: {item['verify']}"))
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
    write_domain_html_reports(reports)
    write_docx(reports)
    print(f"Generated {BUNDLE_DIR}/ with HTML, DOCX, Markdown, and raw reports.")


if __name__ == "__main__":
    main()
