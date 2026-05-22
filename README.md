# Website Security Audit

This repository contains a GitHub Actions based website security audit pipeline.
It scans a target URL for TLS issues, HTTP security headers, DNS records, open
ports, web server findings, dependency CVEs, leaked secrets, and cookie flags.

## Structure

```text
.github/workflows/website-security-audit.yml  Main GitHub Actions workflow
config/domains.txt                            Default target domain list
.zap/rules.tsv                                Optional ZAP rule overrides
scripts/security/common.sh                    Shared script helpers
scripts/security/build_target_matrix.py       Builds the GitHub Actions domain matrix
scripts/security/run_domain_scans.sh          Runs all domain scanners for every configured target
scripts/security/generate_report_bundle.py    Builds HTML, DOCX, Markdown, and raw report bundle
scripts/security/ssl_tls_scan.sh              TLS and certificate checks
scripts/security/headers_scan.sh              HTTP security header checks
scripts/security/dns_security_scan.sh         DNSSEC, SPF, DMARC, MX, CAA checks
scripts/security/port_scan.sh                 Nmap service enumeration
scripts/security/nikto_scan.sh                Nikto web server scan
scripts/security/cookie_scan.sh               Cookie flag checks
scripts/security/generate_summary.sh          Consolidated report generator
```

## Running in GitHub Actions

Add the websites you want to scan in `config/domains.txt`, one URL per line:

```text
https://example.com
https://example.org
```

Open the `Website Security Audit` workflow in GitHub Actions and run it
manually. If you leave the manual input blank, the workflow uses
`config/domains.txt`.

For a one-off run, you can provide comma-separated or newline-separated URLs in
the workflow dispatch input. Those values override `config/domains.txt` for that
run only.

The workflow also runs on pushes and pull requests to `main` or `master`, and on
a weekly Monday schedule at 08:00 UTC.

## Local Script Usage

The scripts are designed for Ubuntu-like environments with the relevant tools
installed.

```bash
export TARGET_URL="https://example.com"
export REPORT_DIR="security-reports"

bash scripts/security/headers_scan.sh
bash scripts/security/dns_security_scan.sh
bash scripts/security/cookie_scan.sh
```

Some scans require extra tools:

- `ssl_tls_scan.sh`: `openssl`, `docker`
- `dns_security_scan.sh`: `dig`
- `port_scan.sh`: `nmap`
- `nikto_scan.sh`: `nikto`

## Reports

The workflow publishes one consolidated artifact named `full-security-audit`.
It does not upload each scanner result as a separate GitHub artifact.

Inside `full-security-audit` you will find:

- `index.html` - a polished browser dashboard with summary cards, filters, search, and organized scanner sections
- `security-audit-report.docx` - one Word-compatible document containing all reports
- `security-summary.md` - a Markdown summary
- `raw-reports/` - all original scanner artifacts in one place
