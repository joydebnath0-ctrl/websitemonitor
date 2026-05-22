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
    nav_items = "\n".join(
        f'<a href="#{html.escape(report["name"])}">{html.escape(report["name"])}</a>'
        for report in reports
    )

    sections = []
    for report in reports:
        files_html = []
        for file_info in report["files"]:
            content = html.escape(file_info["content"])
            path = html.escape(file_info["relative_path"])
            files_html.append(
                f"""
                <details class="file" open>
                  <summary>{path}</summary>
                  <pre>{content}</pre>
                </details>
                """
            )

        sections.append(
            f"""
            <section id="{html.escape(report["name"])}">
              <h2>{html.escape(report["name"])}</h2>
              {''.join(files_html) if files_html else '<p>No files found in this artifact.</p>'}
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
      --bg: #f6f8fb;
      --panel: #ffffff;
      --ink: #172033;
      --muted: #667085;
      --line: #d9e0ea;
      --accent: #0f766e;
      --danger: #b42318;
      --warn: #b54708;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }}
    header {{
      padding: 28px 32px;
      background: var(--panel);
      border-bottom: 1px solid var(--line);
    }}
    h1, h2, h3 {{ margin: 0; }}
    h1 {{ font-size: 28px; }}
    .meta {{ color: var(--muted); margin-top: 6px; }}
    .layout {{
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      gap: 24px;
      padding: 24px 32px;
    }}
    nav {{
      position: sticky;
      top: 16px;
      align-self: start;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      max-height: calc(100vh - 32px);
      overflow: auto;
    }}
    nav a {{
      display: block;
      padding: 8px 10px;
      color: var(--ink);
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
      overflow-wrap: anywhere;
    }}
    nav a:hover {{ background: #eef6f5; color: var(--accent); }}
    .cards {{
      display: grid;
      grid-template-columns: repeat(4, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }}
    .card {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }}
    .value {{ font-size: 24px; font-weight: 700; }}
    .label {{ color: var(--muted); font-size: 13px; }}
    section {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-bottom: 16px;
      padding: 18px;
    }}
    section h2 {{ font-size: 18px; margin-bottom: 12px; overflow-wrap: anywhere; }}
    details.file {{
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-top: 10px;
      overflow: hidden;
    }}
    summary {{
      cursor: pointer;
      padding: 10px 12px;
      background: #f8fafc;
      font-weight: 600;
      overflow-wrap: anywhere;
    }}
    pre {{
      margin: 0;
      padding: 14px;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 12px;
      background: #101828;
      color: #f9fafb;
    }}
    .danger {{ color: var(--danger); }}
    .warn {{ color: var(--warn); }}
    @media (max-width: 900px) {{
      .layout {{ grid-template-columns: 1fr; padding: 18px; }}
      nav {{ position: static; max-height: none; }}
      .cards {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
    }}
  </style>
</head>
<body>
  <header>
    <h1>Website Security Audit</h1>
    <div class="meta">Generated {html.escape(generated_at)}. Open the Word report or browse raw artifacts from this same folder.</div>
  </header>
  <main class="layout">
    <nav>
      <strong>Artifacts</strong>
      {nav_items or '<p>No artifacts found.</p>'}
    </nav>
    <div>
      <div class="cards">
        <div class="card"><div class="value">{len(reports)}</div><div class="label">Artifacts</div></div>
        <div class="card"><div class="value danger">{counts["critical"]}</div><div class="label">Critical Mentions</div></div>
        <div class="card"><div class="value danger">{counts["high"]}</div><div class="label">High Mentions</div></div>
        <div class="card"><div class="value warn">{counts["warning"]}</div><div class="label">Warnings / Missing</div></div>
      </div>
      {''.join(sections) if sections else '<section><h2>No reports found</h2><p>No downloaded reports were found.</p></section>'}
    </div>
  </main>
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
