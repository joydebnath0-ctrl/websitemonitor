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
    lines = [
        "# Website Security Audit Summary",
        "",
        f"**Date:** {generated_at}",
        f"**Triggered by:** {os.environ.get('GITHUB_EVENT_NAME', 'local')}",
        "",
        "## Report Bundle",
        "",
        "- Open `index.html` for the GUI report.",
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


def write_html(reports):
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    counts = all_counts(reports)
    total_files = sum(len(report["files"]) for report in reports)
    status_totals = {"critical": 0, "high": 0, "warning": 0, "ok": 0}
    for report in reports:
        status_totals[report_status(report)] += 1

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
                <details class="file-panel" open>
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
              <div class="report-card__head">
                <div>
                  <p>{html.escape(scan)}</p>
                  <h2>{html.escape(report["name"])}</h2>
                </div>
                <span class="badge badge--{html_attr(status)}">{html.escape(status_label(status))}</span>
              </div>
              <div class="report-card__preview">{html.escape(preview)}</div>
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
  <title>Website Security Audit</title>
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
      --shadow: 0 18px 50px rgba(15, 23, 42, 0.12);
    }}
    * {{ box-sizing: border-box; }}
    html {{ scroll-behavior: smooth; }}
    body {{
      margin: 0;
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.16), transparent 34rem),
        linear-gradient(180deg, #f8fbfd 0%, var(--bg) 52%, #e8eef5 100%);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }}
    .shell {{ min-height: 100vh; }}
    .hero {{
      padding: 32px;
      color: #ffffff;
      background:
        linear-gradient(135deg, rgba(17, 24, 39, 0.98), rgba(15, 118, 110, 0.94)),
        linear-gradient(45deg, rgba(37, 99, 235, 0.24), transparent);
      border-bottom: 1px solid rgba(255, 255, 255, 0.16);
    }}
    .hero__inner {{
      max-width: 1280px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: end;
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
      font-size: 40px;
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
      background: rgba(255, 255, 255, 0.94);
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-bottom: 16px;
      padding: 18px;
      box-shadow: var(--shadow);
      scroll-margin-top: 24px;
    }}
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
      .layout {{ grid-template-columns: 1fr; padding: 18px; }}
      nav {{ position: static; max-height: none; }}
      .overview {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
      .toolbar {{ grid-template-columns: 1fr; }}
      .filters {{ justify-content: flex-start; }}
    }}
    @media (max-width: 560px) {{
      .hero {{ padding: 24px 18px; }}
      h1 {{ font-size: 31px; }}
      .overview {{ grid-template-columns: 1fr; }}
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
          <div class="eyebrow">Security Audit Report</div>
          <h1>Website security posture across domains and scanners</h1>
          <p class="hero__meta">Generated {html.escape(generated_at)}. Consolidated from every scanner output in this workflow run.</p>
        </div>
        <div class="hero__actions">
          <a class="action action--primary" href="security-audit-report.docx">Open DOCX</a>
          <a class="action" href="security-summary.md">Markdown</a>
          <a class="action" href="raw-reports/">Raw Reports</a>
        </div>
      </div>
    </header>
    <main class="layout">
      <nav>
        <strong>Report Index</strong>
        {nav_items or '<p>No artifacts found.</p>'}
      </nav>
      <div>
        <div class="overview">
          <div class="metric"><div class="metric__value">{len(reports)}</div><div class="metric__label">Report Groups</div></div>
          <div class="metric"><div class="metric__value">{total_files}</div><div class="metric__label">Files Captured</div></div>
          <div class="metric"><div class="metric__value danger">{counts["critical"]}</div><div class="metric__label">Critical Mentions</div></div>
          <div class="metric"><div class="metric__value danger">{counts["high"]}</div><div class="metric__label">High Mentions</div></div>
          <div class="metric"><div class="metric__value warn">{counts["warning"]}</div><div class="metric__label">Warnings / Missing</div></div>
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
    write_html(reports)
    write_docx(reports)
    print(f"Generated {BUNDLE_DIR}/ with HTML, DOCX, Markdown, and raw reports.")


if __name__ == "__main__":
    main()
