# Website Security Scanner

A full-stack website security and vulnerability scanner with a non-technical-friendly report UI.

## What It Checks

- SSL/TLS certificate validity, expiry, negotiated protocol, and cipher details
- HTTP security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- DNS and email security: SPF, DKIM common selectors, DMARC, CAA, and a non-intrusive zone-transfer probe
- Common open ports with lightweight banner detection
- Visible software/CMS fingerprints, with optional NVD CVE lookup
- Optional Google Safe Browsing and VirusTotal reputation checks
- robots.txt and common sensitive file exposure paths

The scanner is intentionally non-intrusive: it does not exploit, brute-force, crawl aggressively, fuzz, or run DoS-style checks.

## Setup

```bash
cd security-scanner
npm install
npm start
```

Open `http://localhost:3000`.

## Optional API Keys

Set these environment variables before starting the server:

```bash
NVD_API_KEY=your_nvd_key
GOOGLE_SAFE_BROWSING_API_KEY=your_google_key
VIRUSTOTAL_API_KEY=your_virustotal_key
```

Without these keys, the app still runs all local passive checks and marks external threat-intel checks as not configured.

## Safety Guardrails

- The UI requires explicit permission/ownership confirmation before scanning.
- Backend validates domain format and rejects private, loopback, link-local, and local/internal resolved addresses to reduce SSRF risk.
- Rate limiting allows 12 scan starts per minute per client.
- Port checks are limited to common ports and use short TCP connect attempts only.
- Sensitive file checks use a small fixed list and do not crawl or brute-force.

## Storage

Scan history is stored in SQLite at `data/scans.sqlite` when the runtime supports Node's built-in SQLite module. If you run an older Node version without `node:sqlite`, the app falls back to `data/scans.json` so local development still works.

## API

See [`API.md`](./API.md) or visit `http://localhost:3000/api/docs`.
