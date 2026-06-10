# Website Monitoring Report

**Date:** 2026-06-03 13:25 UTC
**Triggered by:** local

## Quick read

**Overall status:** Review soon

No critical/high wording was found, but some controls need review.

**Targets reviewed:** 1
**Targets needing attention:** 1
**Targets that look good:** 0

## Simple overview

| Target | Status | Health | Page speed | Main issue | First action | Evidence |
|--------|--------|--------|------------|------------|--------------|----------|
| example.com | Review soon | 97 | 100 | MISSING: Strict-Transport-Security - HSTS forces HTTPS connections | Enable HSTS | example-com/headers-report.txt |

## What to do next

### example.com - Enable HSTS

Add a Strict-Transport-Security header after confirming HTTPS works everywhere. Start with max-age=31536000; includeSubDomains, then consider preload only when all subdomains are HTTPS-ready.

**Process**

1. Confirm the site and every required subdomain loads correctly over HTTPS.
2. Add the Strict-Transport-Security response header at the edge proxy, load balancer, CDN, or web server.
3. Start with max-age=31536000; includeSubDomains only when all subdomains are HTTPS-ready.
4. After at least one successful release cycle, consider preload and submit only if you understand the permanent browser preload impact.

**Verify:** Run curl -sI https://your-domain and confirm Strict-Transport-Security is present.


## Files in this bundle

- Open `example-com.html` for the simple dashboard.
- Open `security-audit-report.docx` for the Word-compatible report.
- Open `raw-reports/` for original scanner artifacts.

## Monitored targets

### example.com

**Status:** Review soon

The scan found missing controls or warnings. These are usually configuration improvements.

**Security Diagnostics**

| Check | Status |
| :--- | :--- |
| TLS 1.3 | **Pass** |
| TLS 1.2 | **Pass** |
| TLS 1.0 | **Fail** |
| Weak Ciphers | **Fail** |
| HSTS | **Missing** |
| Certificate Validity | **Pass** |
| SSL Expiration Date | **Jun 2 12:00:00 2027 Gmt** |


**Recommended actions**

#### Enable HSTS

Add a Strict-Transport-Security header after confirming HTTPS works everywhere. Start with max-age=31536000; includeSubDomains, then consider preload only when all subdomains are HTTPS-ready.

**Process**

1. Confirm the site and every required subdomain loads correctly over HTTPS.
2. Add the Strict-Transport-Security response header at the edge proxy, load balancer, CDN, or web server.
3. Start with max-age=31536000; includeSubDomains only when all subdomains are HTTPS-ready.
4. After at least one successful release cycle, consider preload and submit only if you understand the permanent browser preload impact.

**Verify:** Run curl -sI https://your-domain and confirm Strict-Transport-Security is present.


<details>
<summary>Raw scanner output</summary>

#### example-com/headers-report.txt

```text
=== HTTP Security Headers Report ===
Target: https://example.com
MISSING: Strict-Transport-Security - HSTS forces HTTPS connections

```

#### example-com/ssl-report.txt

```text
=== SSL Certificate Report for example.com ===

--- Certificate Expiry ---
notAfter=Jun  2 12:00:00 2027 GMT
Days until expiry: 365

--- Supported TLS Versions ---
ssl3: CONNECTED
tls1: CONNECTED
tls1_1: CONNECTED
tls1_2: CONNECTED
tls1_3: CONNECTED

```

</details>
