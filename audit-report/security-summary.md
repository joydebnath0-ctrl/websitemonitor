# Website Monitoring Report

**Date:** 2026-06-03 06:59 UTC
**Triggered by:** local

## Quick read

**Overall status:** Needs attention

At least one monitored target has high-risk findings or scan errors.

**Targets reviewed:** 2
**Targets needing attention:** 2
**Targets that look good:** 0

## Simple overview

| Target | Status | Health | Page speed | Main issue | First action | Evidence |
|--------|--------|--------|------------|------------|--------------|----------|
| www.vaastumangaal.com | Needs attention | 82 | 76 | ;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 41686 | Control sensitive caching | www-vaastumangaal-com/dns-report.txt |
| proof-of-concern-summary | Needs attention | 93 | 96 | www-vaastumangaal-com            | Open ports               | www-vaastumangaal-com/poc/open-ports.txt      | 4 | Review scanner output | poc-summary.txt |

## What to do next

### www.vaastumangaal.com - Control sensitive caching

For authenticated or sensitive pages, set Cache-Control: no-store. For static assets, use explicit immutable cache rules with hashed filenames.

**Process**

1. Classify pages as public static content, public dynamic content, or sensitive/authenticated content.
2. Set Cache-Control: no-store for sensitive pages and API responses containing private data.
3. Use long-lived immutable caching only for fingerprinted static assets.

**Verify:** Run curl -sI against sensitive pages and confirm Cache-Control prevents storage.

### www.vaastumangaal.com - Improve page speed

Improve performance by reducing redirects, compression gaps, heavy assets, render-blocking scripts, and slow origin response time. Use page-speed-report.txt to decide which bottleneck to fix first.

**Process**

1. Open page-speed-report.txt and check total, start_transfer, redirects, and size_download for the affected domain.
2. Remove unnecessary redirects so HTTP goes directly to the final HTTPS canonical URL in one hop.
3. Put static assets behind a CDN and enable Brotli or gzip compression for HTML, CSS, JavaScript, SVG, and JSON.
4. Minify and split JavaScript/CSS, remove unused third-party scripts, and defer non-critical scripts.
5. Optimize images with WebP/AVIF, correct dimensions, lazy loading, and long-lived cache headers for fingerprinted assets.
6. If start_transfer is high, review origin CPU/database work, caching, CDN origin shielding, and server response generation time.

**Verify:** Rerun the workflow and confirm page-speed-report.txt shows lower total time, fewer redirects, and an improved Page speed score.

### proof-of-concern-summary - Review scanner output

Inspect the detailed scanner output, prioritize critical and high-risk items, apply vendor guidance, then rerun the workflow to verify remediation.

**Process**

1. Open the raw scanner output and identify the exact URL, header, port, package, or DNS record involved.
2. Prioritize critical and high-risk items before informational cleanup.
3. Apply the vendor or scanner recommendation and document any accepted risk.

**Verify:** Rerun the workflow and confirm the finding count decreases or the accepted risk is documented.


## Files in this bundle

- Open `www-vaastumangaal-com.html` for the simple dashboard.
- Open `security-audit-report.docx` for the Word-compatible report.
- Open `raw-reports/` for original scanner artifacts.

## Monitored targets

### www.vaastumangaal.com

**Status:** Needs attention

High-risk, vulnerable, or error wording was found. Review this target before routine cleanup work.

**Security Diagnostics**

| Check | Status |
| :--- | :--- |
| TLS 1.3 | **Pass** |
| TLS 1.2 | **Pass** |
| TLS 1.0 | **Pass** |
| Weak Ciphers | **Fail** |
| HSTS | **Pass** |
| Certificate Validity | **Pass** |
| SSL Expiration Date | **Aug 4 12:26:56 2026 Gmt** |


**Recommended actions**

#### Control sensitive caching

For authenticated or sensitive pages, set Cache-Control: no-store. For static assets, use explicit immutable cache rules with hashed filenames.

**Process**

1. Classify pages as public static content, public dynamic content, or sensitive/authenticated content.
2. Set Cache-Control: no-store for sensitive pages and API responses containing private data.
3. Use long-lived immutable caching only for fingerprinted static assets.

**Verify:** Run curl -sI against sensitive pages and confirm Cache-Control prevents storage.

#### Improve page speed

Improve performance by reducing redirects, compression gaps, heavy assets, render-blocking scripts, and slow origin response time. Use page-speed-report.txt to decide which bottleneck to fix first.

**Process**

1. Open page-speed-report.txt and check total, start_transfer, redirects, and size_download for the affected domain.
2. Remove unnecessary redirects so HTTP goes directly to the final HTTPS canonical URL in one hop.
3. Put static assets behind a CDN and enable Brotli or gzip compression for HTML, CSS, JavaScript, SVG, and JSON.
4. Minify and split JavaScript/CSS, remove unused third-party scripts, and defer non-critical scripts.
5. Optimize images with WebP/AVIF, correct dimensions, lazy loading, and long-lived cache headers for fingerprinted assets.
6. If start_transfer is high, review origin CPU/database work, caching, CDN origin shielding, and server response generation time.

**Verify:** Rerun the workflow and confirm page-speed-report.txt shows lower total time, fewer redirects, and an improved Page speed score.


<details>
<summary>Raw scanner output</summary>

#### www-vaastumangaal-com/cookie-report.txt

```text
=== Cookie Security Analysis ===
Target: https://www.vaastumangaal.com
No Set-Cookie headers found on initial response.

```

#### www-vaastumangaal-com/dns-report.txt

```text
=== DNS Security Report for www.vaastumangaal.com ===

--- A / AAAA Records ---
104.21.7.52
172.67.135.197
2606:4700:3035::ac43:87c5
2606:4700:3030::6815:734

--- DNSSEC Validation ---
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 41686
;; flags: qr rd ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1

--- SPF Record ---
MISSING: No SPF record found

--- DMARC Record ---
MISSING: No DMARC record found

--- MX Records ---

--- CAA Records ---
No CAA records found. Any CA may be able to issue certificates for this domain.

```

#### www-vaastumangaal-com/headers-report.txt

```text
=== HTTP Security Headers Report ===
Target: https://www.vaastumangaal.com

--- Raw Headers ---
HTTP/2 200 
date: Wed, 03 Jun 2026 06:29:57 GMT
content-type: text/html; charset=UTF-8
server: cloudflare
x-frame-options: SAMEORIGIN
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: geolocation=(), microphone=(), camera=(), autoplay=(), fullscreen=(self)
strict-transport-security: max-age=31536000; includeSubDomains; preload
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://js.stripe.com https://www.paypal.com https://*.paypalobjects.com https://www.googletagmanager.com https://www.google-analytics.com https://www.youtube.com https://player.vimeo.com https://*.wordpress.com https://*.elementor.com https://*.googleapis.com https://*.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://esm.sh https://code.jquery.com https://cdn.trustindex.io https://translate.google.com https://connect.facebook.net https://embed.tawk.to https://static.cloudflareinsights.com blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.googleapis.com https://*.elementor.com https://www.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://cdn.trustindex.io https://*.tawk.to https://unpkg.com; img-src 'self' data: blob: https://*; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.trustindex.io https://*.tawk.to data:; connect-src 'self' https://www.google.com https://www.gstatic.com https://www.google-analytics.com https://www.googletagmanager.com https://stats.g.doubleclick.net https://api.stripe.com https://js.stripe.com https://*.paypal.com https://*.paypalobjects.com https://maps.googleapis.com https://events.buddyboss.com https://*.theeventscalendar.com https://www.youtube.com https://player.vimeo.com https://*.wordpress.com https://*.elementor.com https://*.googleapis.com https://*.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://cdn.trustindex.io https://esm.sh https://ipapi.co/json/ https://*.tawk.to wss://*.tawk.to ; frame-src 'self' https://www.google.com https://js.stripe.com https://www.paypal.com https://*.paypalobjects.com https://www.youtube.com https://player.vimeo.com https://www.youtube-nocookie.com/; media-src 'self' blob: https://player.vimeo.com https://www.youtube.com; object-src 'none'; base-uri 'self'; form-action 'self' https://www.paypal.com https://*.stripe.com; frame-ancestors 'self'; upgrade-insecure-requests;
link: <https://www.vaastumangaal.com/wp-json/>; rel="https://api.w.org/", <https://www.vaastumangaal.com/wp-json/wp/v2/pages/22>; rel="alternate"; title="JSON"; type="application/json", <https://www.vaastumangaal.com/>; rel=shortlink
vary: Accept-Encoding
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=2g5FLgv9yv9Fyj1DufU5zfpPUrZkvzAFWTe8qJeJH3sLdIc%2Bg0ii1MhpKLvrH4YnFTkIK5WzmGTsm4pC3opigtndIj8%2BySurjhsaPoHnXYn6y8n34h77VVbvhSLyOZqwCigQVFZHKURoRHnhSjWoaJAmQaQ%3D"}]}
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-cache-status: DYNAMIC
cf-ray: a05ca57159782e89-BOM
alt-svc: h3=":443"; ma=86400


--- Security Header Analysis ---
PRESENT: permissions-policy: geolocation=(), microphone=(), camera=(), autoplay=(), fullscreen=(self)
PRESENT: referrer-policy: strict-origin-when-cross-origin
PRESENT: strict-transport-security: max-age=31536000; includeSubDomains; preload
PRESENT: x-content-type-options: nosniff
MISSING: X-XSS-Protection - Legacy XSS filter
PRESENT: x-frame-options: SAMEORIGIN
MISSING: Cache-Control - Controls caching behavior
PRESENT: content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://js.stripe.com https://www.paypal.com https://*.paypalobjects.com https://www.googletagmanager.com https://www.google-analytics.com https://www.youtube.com https://player.vimeo.com https://*.wordpress.com https://*.elementor.com https://*.googleapis.com https://*.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://esm.sh https://code.jquery.com https://cdn.trustindex.io https://translate.google.com https://connect.facebook.net https://embed.tawk.to https://static.cloudflareinsights.com blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.googleapis.com https://*.elementor.com https://www.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://cdn.trustindex.io https://*.tawk.to https://unpkg.com; img-src 'self' data: blob: https://*; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.trustindex.io https://*.tawk.to data:; connect-src 'self' https://www.google.com https://www.gstatic.com https://www.google-analytics.com https://www.googletagmanager.com https://stats.g.doubleclick.net https://api.stripe.com https://js.stripe.com https://*.paypal.com https://*.paypalobjects.com https://maps.googleapis.com https://events.buddyboss.com https://*.theeventscalendar.com https://www.youtube.com https://player.vimeo.com https://*.wordpress.com https://*.elementor.com https://*.googleapis.com https://*.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://cdn.trustindex.io https://esm.sh https://ipapi.co/json/ https://*.tawk.to wss://*.tawk.to ; frame-src 'self' https://www.google.com https://js.stripe.com https://www.paypal.com https://*.paypalobjects.com https://www.youtube.com https://player.vimeo.com https://www.youtube-nocookie.com/; media-src 'self' blob: https://player.vimeo.com https://www.youtube.com; object-src 'none'; base-uri 'self'; form-action 'self' https://www.paypal.com https://*.stripe.com; frame-ancestors 'self'; upgrade-insecure-requests;

Total missing headers: 2

```

#### www-vaastumangaal-com/nikto-report.txt

```text
- Nikto v2.1.5/2.1.5
+ Target Host: www.vaastumangaal.com
+ Target Port: 443
+ GET /: The anti-clickjacking X-Frame-Options header is not present.
+ GET /: Uncommon header 'cf-ray' found, with contents: -

```

#### www-vaastumangaal-com/poc/headers.txt

```text
HTTP/2 200 
date: Wed, 03 Jun 2026 06:30:58 GMT
content-type: text/html; charset=UTF-8
server: cloudflare
x-frame-options: SAMEORIGIN
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: geolocation=(), microphone=(), camera=(), autoplay=(), fullscreen=(self)
strict-transport-security: max-age=31536000; includeSubDomains; preload
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://js.stripe.com https://www.paypal.com https://*.paypalobjects.com https://www.googletagmanager.com https://www.google-analytics.com https://www.youtube.com https://player.vimeo.com https://*.wordpress.com https://*.elementor.com https://*.googleapis.com https://*.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://esm.sh https://code.jquery.com https://cdn.trustindex.io https://translate.google.com https://connect.facebook.net https://embed.tawk.to https://static.cloudflareinsights.com blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.googleapis.com https://*.elementor.com https://www.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://cdn.trustindex.io https://*.tawk.to https://unpkg.com; img-src 'self' data: blob: https://*; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.trustindex.io https://*.tawk.to data:; connect-src 'self' https://www.google.com https://www.gstatic.com https://www.google-analytics.com https://www.googletagmanager.com https://stats.g.doubleclick.net https://api.stripe.com https://js.stripe.com https://*.paypal.com https://*.paypalobjects.com https://maps.googleapis.com https://events.buddyboss.com https://*.theeventscalendar.com https://www.youtube.com https://player.vimeo.com https://*.wordpress.com https://*.elementor.com https://*.googleapis.com https://*.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://cdn.trustindex.io https://esm.sh https://ipapi.co/json/ https://*.tawk.to wss://*.tawk.to ; frame-src 'self' https://www.google.com https://js.stripe.com https://www.paypal.com https://*.paypalobjects.com https://www.youtube.com https://player.vimeo.com https://www.youtube-nocookie.com/; media-src 'self' blob: https://player.vimeo.com https://www.youtube.com; object-src 'none'; base-uri 'self'; form-action 'self' https://www.paypal.com https://*.stripe.com; frame-ancestors 'self'; upgrade-insecure-requests;
link: <https://www.vaastumangaal.com/wp-json/>; rel="https://api.w.org/", <https://www.vaastumangaal.com/wp-json/wp/v2/pages/22>; rel="alternate"; title="JSON"; type="application/json", <https://www.vaastumangaal.com/>; rel=shortlink
vary: Accept-Encoding
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=FJsX5wuTUyUhbcYvpt5w%2FjCT3iQpJCXssAKqDLViJ6dxCP7%2FoKZzGEeUFitMRkZJpexgNoREK3HMIZWkfzOemH%2BFQHPvOVKHlvhj9ZyNOShsL1X9gMuXMvRWRflyi2r0BWG4zLaB2VUs2lGjCb6LnMqX1xU%3D"}]}
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-cache-status: DYNAMIC
cf-ray: a05ca6f719febc9a-BOM
alt-svc: h3=":443"; ma=86400


MISSING HEADERS:
None

```

#### www-vaastumangaal-com/poc/open-ports.txt

```text
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-06-03 06:30 UTC
Nmap scan report for www.vaastumangaal.com (104.21.7.52)
Host is up (0.0012s latency).
Other addresses for www.vaastumangaal.com (not scanned): 2606:4700:3030::6815:734 2606:4700:3035::ac43:87c5 172.67.135.197
Not shown: 996 filtered tcp ports (no-response)
Some closed ports may be reported as filtered due to --defeat-rst-ratelimit
PORT     STATE SERVICE
80/tcp   open  http
443/tcp  open  https
8080/tcp open  http-proxy
8443/tcp open  https-alt

Nmap done: 1 IP address (1 host up) scanned in 4.66 seconds

BANNER GRAB RESULTS:

Port 8080:
Connection to www.vaastumangaal.com (2606:4700:3035::ac43:87c5) 8080 port [tcp/http-alt] succeeded!

Port 8443:
Connection to www.vaastumangaal.com (2606:4700:3030::6815:734) 8443 port [tcp/*] succeeded!

```

#### www-vaastumangaal-com/poc/redirect-chain.txt

```text
HTTP/1.1 301 Moved Permanently
Date: Wed, 03 Jun 2026 06:31:04 GMT
Content-Type: text/html; charset=UTF-8
Connection: keep-alive
Server: cloudflare
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=(), autoplay=(), fullscreen=(self)
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://js.stripe.com https://www.paypal.com https://*.paypalobjects.com https://www.googletagmanager.com https://www.google-analytics.com https://www.youtube.com https://player.vimeo.com https://*.wordpress.com https://*.elementor.com https://*.googleapis.com https://*.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://esm.sh https://code.jquery.com https://cdn.trustindex.io https://translate.google.com https://connect.facebook.net https://embed.tawk.to https://static.cloudflareinsights.com blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.googleapis.com https://*.elementor.com https://www.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://cdn.trustindex.io https://*.tawk.to https://unpkg.com; img-src 'self' data: blob: https://*; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.trustindex.io https://*.tawk.to data:; connect-src 'self' https://www.google.com https://www.gstatic.com https://www.google-analytics.com https://www.googletagmanager.com https://stats.g.doubleclick.net https://api.stripe.com https://js.stripe.com https://*.paypal.com https://*.paypalobjects.com https://maps.googleapis.com https://events.buddyboss.com https://*.theeventscalendar.com https://www.youtube.com https://player.vimeo.com https://*.wordpress.com https://*.elementor.com https://*.googleapis.com https://*.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://cdn.trustindex.io https://esm.sh https://ipapi.co/json/ https://*.tawk.to wss://*.tawk.to ; frame-src 'self' https://www.google.com https://js.stripe.com https://www.paypal.com https://*.paypalobjects.com https://www.youtube.com https://player.vimeo.com https://www.youtube-nocookie.com/; media-src 'self' blob: https://player.vimeo.com https://www.youtube.com; object-src 'none'; base-uri 'self'; form-action 'self' https://www.paypal.com https://*.stripe.com; frame-ancestors 'self'; upgrade-insecure-requests;
Expires: Wed, 03 Jun 2026 07:31:04 GMT
Cache-Control: max-age=3600
X-Redirect-By: WordPress
Location: https://www.vaastumangaal.com/
Vary: Accept-Encoding
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-cache-status: DYNAMIC
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=YYaCe7YScwoo1g5fiLZsqI%2BNs8BNLDeDP%2FZ2PlXJU1kZHRiyQubimXollimyR7hJVeepxOFOic8p1GeBc%2FbuX3uEnbFB5XyyyFS0rwcjZZqKUNxFaVkMpOcKL0EMYBdkmPwbJpkUDNwv29sI9bqeyOWVccM%3D"}]}
CF-RAY: a05ca7193bc69a4a-BOM
alt-svc: h3=":443"; ma=86400

HTTP/2 200 
date: Wed, 03 Jun 2026 06:31:04 GMT
content-type: text/html; charset=UTF-8
server: cloudflare
x-frame-options: SAMEORIGIN
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: geolocation=(), microphone=(), camera=(), autoplay=(), fullscreen=(self)
strict-transport-security: max-age=31536000; includeSubDomains; preload
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://js.stripe.com https://www.paypal.com https://*.paypalobjects.com https://www.googletagmanager.com https://www.google-analytics.com https://www.youtube.com https://player.vimeo.com https://*.wordpress.com https://*.elementor.com https://*.googleapis.com https://*.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://esm.sh https://code.jquery.com https://cdn.trustindex.io https://translate.google.com https://connect.facebook.net https://embed.tawk.to https://static.cloudflareinsights.com blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.googleapis.com https://*.elementor.com https://www.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://cdn.trustindex.io https://*.tawk.to https://unpkg.com; img-src 'self' data: blob: https://*; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.trustindex.io https://*.tawk.to data:; connect-src 'self' https://www.google.com https://www.gstatic.com https://www.google-analytics.com https://www.googletagmanager.com https://stats.g.doubleclick.net https://api.stripe.com https://js.stripe.com https://*.paypal.com https://*.paypalobjects.com https://maps.googleapis.com https://events.buddyboss.com https://*.theeventscalendar.com https://www.youtube.com https://player.vimeo.com https://*.wordpress.com https://*.elementor.com https://*.googleapis.com https://*.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://cdn.trustindex.io https://esm.sh https://ipapi.co/json/ https://*.tawk.to wss://*.tawk.to ; frame-src 'self' https://www.google.com https://js.stripe.com https://www.paypal.com https://*.paypalobjects.com https://www.youtube.com https://player.vimeo.com https://www.youtube-nocookie.com/; media-src 'self' blob: https://player.vimeo.com https://www.youtube.com; object-src 'none'; base-uri 'self'; form-action 'self' https://www.paypal.com https://*.stripe.com; frame-ancestors 'self'; upgrade-insecure-requests;
link: <https://www.vaastumangaal.com/wp-json/>; rel="https://api.w.org/", <https://www.vaastumangaal.com/wp-json/wp/v2/pages/22>; rel="alternate"; title="JSON"; type="application/json", <https://www.vaastumangaal.com/>; rel=shortlink
vary: Accept-Encoding
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=8imrr8tHRGBXg6fEo9Rg4fxB3AJvjfNvmdjMp9yW%2BtcbAHvGZhVJAZRBtsWn36t6sPuOJzaVmeQGly3RxKxoEY1wJudK3mmtmwaBnAmgx6e10Dcl63vnSzKJLadFS2SJFZpfVR7%2FUnbKZbK%2BJNbiXrn3CMs%3D"}]}
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-cache-status: DYNAMIC
cf-ray: a05ca71bbd2385c5-BOM
alt-svc: h3=":443"; ma=86400


```

#### www-vaastumangaal-com/poc/tls-ciphers.txt

```text
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-06-03 06:30 UTC
Nmap scan report for www.vaastumangaal.com (172.67.135.197)
Host is up (0.0013s latency).
Other addresses for www.vaastumangaal.com (not scanned): 2606:4700:3035::ac43:87c5 2606:4700:3030::6815:734 104.21.7.52

PORT    STATE SERVICE
443/tcp open  https
| ssl-enum-ciphers: 
|   TLSv1.0: 
|     ciphers: 
|       TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA (ecdh_x25519) - A
|       TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA (ecdh_x25519) - A
|     compressors: 
|       NULL
|     cipher preference: server
|   TLSv1.1: 
|     ciphers: 
|       TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA (ecdh_x25519) - A
|       TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA (ecdh_x25519) - A
|     compressors: 
|       NULL
|     cipher preference: server
|   TLSv1.2: 
|     ciphers: 
|       TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA (ecdh_x25519) - A
|       TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256 (ecdh_x25519) - A
|       TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256 (ecdh_x25519) - A
|       TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA (ecdh_x25519) - A
|       TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA384 (ecdh_x25519) - A
|       TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384 (ecdh_x25519) - A
|       TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256 (ecdh_x25519) - A
|     compressors: 
|       NULL
|     cipher preference: client
|   TLSv1.3: 
|     ciphers: 
|       TLS_AKE_WITH_AES_128_GCM_SHA256 (ecdh_x25519) - A
|       TLS_AKE_WITH_AES_256_GCM_SHA384 (ecdh_x25519) - A
|       TLS_AKE_WITH_CHACHA20_POLY1305_SHA256 (ecdh_x25519) - A
|     cipher preference: client
|_  least strength: A

Nmap done: 1 IP address (1 host up) scanned in 0.27 seconds

```

#### www-vaastumangaal-com/poc/tls-handshake.txt

```text
depth=2 C = US, O = Internet Security Research Group, CN = ISRG Root X1
verify return:1
depth=1 C = US, O = Let's Encrypt, CN = E7
verify return:1
depth=0 CN = vaastumangaal.com
verify return:1
CONNECTED(00000003)
---
Certificate chain
 0 s:CN = vaastumangaal.com
   i:C = US, O = Let's Encrypt, CN = E7
   a:PKEY: id-ecPublicKey, 256 (bit); sigalg: ecdsa-with-SHA384
   v:NotBefore: May  6 12:26:57 2026 GMT; NotAfter: Aug  4 12:26:56 2026 GMT
 1 s:C = US, O = Let's Encrypt, CN = E7
   i:C = US, O = Internet Security Research Group, CN = ISRG Root X1
   a:PKEY: id-ecPublicKey, 384 (bit); sigalg: RSA-SHA256
   v:NotBefore: Mar 13 00:00:00 2024 GMT; NotAfter: Mar 12 23:59:59 2027 GMT
---
Server certificate
-----BEGIN CERTIFICATE-----
MIIDoDCCAyegAwIBAgISBu4Ur9zddNDiAQhwhCTVKh4QMAoGCCqGSM49BAMDMDIx
CzAJBgNVBAYTAlVTMRYwFAYDVQQKEw1MZXQncyBFbmNyeXB0MQswCQYDVQQDEwJF
NzAeFw0yNjA1MDYxMjI2NTdaFw0yNjA4MDQxMjI2NTZaMBwxGjAYBgNVBAMTEXZh
YXN0dW1hbmdhYWwuY29tMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAES6VpTiUg
3KuYigoQoSLzpM+0MgPUIWzp0ICiN8ti5Sp1vNQbf1lCWfNFxl+0esDGNcjhfNqB
Mh63QPVYC40RVqOCAjEwggItMA4GA1UdDwEB/wQEAwIHgDATBgNVHSUEDDAKBggr
BgEFBQcDATAMBgNVHRMBAf8EAjAAMB0GA1UdDgQWBBQQmOz3t1twMhxLvQhjKYgy
lmgjLjAfBgNVHSMEGDAWgBSuSJ7chx1EoG/aouVgdAR4wpwAgDAyBggrBgEFBQcB
AQQmMCQwIgYIKwYBBQUHMAKGFmh0dHA6Ly9lNy5pLmxlbmNyLm9yZy8wMQYDVR0R
BCowKIITKi52YWFzdHVtYW5nYWFsLmNvbYIRdmFhc3R1bWFuZ2FhbC5jb20wEwYD
VR0gBAwwCjAIBgZngQwBAgEwLQYDVR0fBCYwJDAioCCgHoYcaHR0cDovL2U3LmMu
bGVuY3Iub3JnLzE3LmNybDCCAQsGCisGAQQB1nkCBAIEgfwEgfkA9wB2AMIxfldF
GaNF7n843rKQQevHwiFaIr9/1bWtdprZDlLNAAABnf13AYoAAAQDAEcwRQIgDd6D
TX6kjLpnfcId3GnMHuWPi7oIkR+65+U0Ne5LVfMCIQC849tD7/2p+6ZvJEd5oG/c
h6NQTkng+mWycd29L4dKzgB9AGz+UBlDqF6pFrxS0TPk3Mke8UEcfSWEINFzgJ4Y
GOs6AAABnf13AdYACAAABQAKRSaUBAMARjBEAiAR+ndDG6ZNd2DEaP2NFe7vw5OJ
M0gb3Xe9XYYego48zQIgOEvzJKckxlEyI9W/JjrazV2A87g6yrVRNUkMgeSJfvsw
CgYIKoZIzj0EAwMDZwAwZAIwVAEhG5IMz2S+yclP7a03CGfwM3yGVPkXNc9LsL60
u3UJGp06Dk8/v5ELkLZZrTs0AjAnf1VdKxa8S/8/WSZ+1S7h7H0wUMTGEQokWt2J
kDmyfYIQ1Pqlem5aZNFs3exXgnE=
-----END CERTIFICATE-----
subject=CN = vaastumangaal.com
issuer=C = US, O = Let's Encrypt, CN = E7
---
No client certificate CA names sent
Peer signing digest: SHA256
Peer signature type: ECDSA
Server Temp Key: X25519, 253 bits
---
SSL handshake has read 2362 bytes and written 403 bytes
Verification: OK
---
New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384
Server public key is 256 bit
Secure Renegotiation IS NOT supported
Compression: NONE
Expansion: NONE
No ALPN negotiated
Early data was not sent
Verify return code: 0 (ok)
---
DONE

```

#### www-vaastumangaal-com/poc/zap-high-findings.txt

```text
ZAP scan results not available.

```

#### www-vaastumangaal-com/ports-nmap.txt

```text
# Nmap 7.94SVN scan initiated Wed Jun  3 06:29:58 2026 as: nmap -sV --open -p 21,22,23,25,53,80,110,143,443,445,3306,3389,5432,6379,8080,8443,8888,9200,27017 --script=banner,http-title,ssl-cert -oN all-reports/www-vaastumangaal-com/ports-nmap.txt www.vaastumangaal.com
Nmap scan report for www.vaastumangaal.com (104.21.7.52)
Host is up (0.0010s latency).
Other addresses for www.vaastumangaal.com (not scanned): 2606:4700:3035::ac43:87c5 2606:4700:3030::6815:734 172.67.135.197
Not shown: 15 filtered tcp ports (no-response)
Some closed ports may be reported as filtered due to --defeat-rst-ratelimit
PORT     STATE SERVICE  VERSION
80/tcp   open  http     Cloudflare http proxy
|_http-title: Did not follow redirect to https://www.vaastumangaal.com/
|_http-server-header: cloudflare
443/tcp  open  ssl/http Cloudflare http proxy
|_http-server-header: cloudflare
|_http-title: Site doesn't have a title (text/html; charset=UTF-8).
| ssl-cert: Subject: commonName=vaastumangaal.com
| Subject Alternative Name: DNS:*.vaastumangaal.com, DNS:vaastumangaal.com
| Issuer: commonName=E7/organizationName=Let's Encrypt/countryName=US
| Public Key type: ec
| Public Key bits: 256
| Signature Algorithm: ecdsa-with-SHA384
| Not valid before: 2026-05-06T12:26:57
| Not valid after:  2026-08-04T12:26:56
| MD5:   28de:dbfb:eac9:93b7:f03c:c855:e365:e5ba
|_SHA-1: ad49:73e9:8a47:1fbf:815c:febd:f343:d3f4:8b2a:dad3
8080/tcp open  http     Cloudflare http proxy
|_http-server-header: cloudflare
|_http-title: Site doesn't have a title (text/plain; charset=UTF-8).
8443/tcp open  ssl/http Cloudflare http proxy
|_http-server-header: cloudflare
|_http-title: Site doesn't have a title (text/plain; charset=UTF-8).
| ssl-cert: Subject: commonName=vaastumangaal.com
| Subject Alternative Name: DNS:*.vaastumangaal.com, DNS:vaastumangaal.com
| Issuer: commonName=E7/organizationName=Let's Encrypt/countryName=US
| Public Key type: ec
| Public Key bits: 256
| Signature Algorithm: ecdsa-with-SHA384
| Not valid before: 2026-05-06T12:26:57
| Not valid after:  2026-08-04T12:26:56
| MD5:   28de:dbfb:eac9:93b7:f03c:c855:e365:e5ba
|_SHA-1: ad49:73e9:8a47:1fbf:815c:febd:f343:d3f4:8b2a:dad3

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
# Nmap done at Wed Jun  3 06:30:33 2026 -- 1 IP address (1 host up) scanned in 34.66 seconds

```

#### www-vaastumangaal-com/ports-report.txt

```text
=== Open Port Scan for www.vaastumangaal.com ===
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-06-03 06:29 UTC
Nmap scan report for www.vaastumangaal.com (104.21.7.52)
Host is up (0.0010s latency).
Other addresses for www.vaastumangaal.com (not scanned): 2606:4700:3035::ac43:87c5 2606:4700:3030::6815:734 172.67.135.197
Not shown: 15 filtered tcp ports (no-response)
Some closed ports may be reported as filtered due to --defeat-rst-ratelimit
PORT     STATE SERVICE  VERSION
80/tcp   open  http     Cloudflare http proxy
|_http-title: Did not follow redirect to https://www.vaastumangaal.com/
|_http-server-header: cloudflare
443/tcp  open  ssl/http Cloudflare http proxy
|_http-server-header: cloudflare
|_http-title: Site doesn't have a title (text/html; charset=UTF-8).
| ssl-cert: Subject: commonName=vaastumangaal.com
| Subject Alternative Name: DNS:*.vaastumangaal.com, DNS:vaastumangaal.com
| Issuer: commonName=E7/organizationName=Let's Encrypt/countryName=US
| Public Key type: ec
| Public Key bits: 256
| Signature Algorithm: ecdsa-with-SHA384
| Not valid before: 2026-05-06T12:26:57
| Not valid after:  2026-08-04T12:26:56
| MD5:   28de:dbfb:eac9:93b7:f03c:c855:e365:e5ba
|_SHA-1: ad49:73e9:8a47:1fbf:815c:febd:f343:d3f4:8b2a:dad3
8080/tcp open  http     Cloudflare http proxy
|_http-server-header: cloudflare
|_http-title: Site doesn't have a title (text/plain; charset=UTF-8).
8443/tcp open  ssl/http Cloudflare http proxy
|_http-server-header: cloudflare
|_http-title: Site doesn't have a title (text/plain; charset=UTF-8).
| ssl-cert: Subject: commonName=vaastumangaal.com
| Subject Alternative Name: DNS:*.vaastumangaal.com, DNS:vaastumangaal.com
| Issuer: commonName=E7/organizationName=Let's Encrypt/countryName=US
| Public Key type: ec
| Public Key bits: 256
| Signature Algorithm: ecdsa-with-SHA384
| Not valid before: 2026-05-06T12:26:57
| Not valid after:  2026-08-04T12:26:56
| MD5:   28de:dbfb:eac9:93b7:f03c:c855:e365:e5ba
|_SHA-1: ad49:73e9:8a47:1fbf:815c:febd:f343:d3f4:8b2a:dad3

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 34.66 seconds

--- Risk Assessment of Open Ports ---

```

#### www-vaastumangaal-com/ssl-report.txt

```text
=== SSL Certificate Report for www.vaastumangaal.com ===

--- Certificate Expiry ---
notBefore=May  6 12:26:57 2026 GMT
notAfter=Aug  4 12:26:56 2026 GMT
Days until expiry: 62

--- Certificate Subject and SANs ---
subject=CN = vaastumangaal.com
issuer=C = US, O = Let's Encrypt, CN = E7
X509v3 Subject Alternative Name: 
    DNS:*.vaastumangaal.com, DNS:vaastumangaal.com

--- Supported TLS Versions ---
ssl3: 
tls1: 4017020AB57A0000:error:0A0000BF:SSL routines:tls_setup_handshake:no protocols available:../ssl/statem/statem_lib.c:104:
CONNECTED(00000003)
New, (NONE), Cipher is (NONE)
tls1_1: 40F7AA83CC760000:error:0A0000BF:SSL routines:tls_setup_handshake:no protocols available:../ssl/statem/statem_lib.c:104:
CONNECTED(00000003)
New, (NONE), Cipher is (NONE)
tls1_2: CONNECTED(00000003)
New, TLSv1.2, Cipher is ECDHE-ECDSA-CHACHA20-POLY1305
    Cipher    : ECDHE-ECDSA-CHACHA20-POLY1305
tls1_3: CONNECTED(00000003)
New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384

--- testssl.sh ---

```

#### www-vaastumangaal-com/testssl-report.txt

```text
scripts/security/ssl_tls_scan.sh: line 40: docker: command not found

```

</details>

### proof-of-concern-summary

**Status:** Needs attention

High-risk, vulnerable, or error wording was found. Review this target before routine cleanup work.

**Recommended actions**

#### Review scanner output

Inspect the detailed scanner output, prioritize critical and high-risk items, apply vendor guidance, then rerun the workflow to verify remediation.

**Process**

1. Open the raw scanner output and identify the exact URL, header, port, package, or DNS record involved.
2. Prioritize critical and high-risk items before informational cleanup.
3. Apply the vendor or scanner recommendation and document any accepted risk.

**Verify:** Rerun the workflow and confirm the finding count decreases or the accepted risk is documented.


<details>
<summary>Raw scanner output</summary>

#### poc-summary.txt

```text
Slug                             | Check                    | File                                          | Finding Count
---------------------------------+--------------------------+-----------------------------------------------+--------------
www-vaastumangaal-com            | Header proof             | www-vaastumangaal-com/poc/headers.txt         | 0
www-vaastumangaal-com            | TLS handshake            | www-vaastumangaal-com/poc/tls-handshake.txt   | 0
www-vaastumangaal-com            | TLS ciphers              | www-vaastumangaal-com/poc/tls-ciphers.txt     | 3
www-vaastumangaal-com            | Open ports               | www-vaastumangaal-com/poc/open-ports.txt      | 4
www-vaastumangaal-com            | Redirect chain           | www-vaastumangaal-com/poc/redirect-chain.txt  | 3
www-vaastumangaal-com            | ZAP evidence             | www-vaastumangaal-com/poc/zap-high-findings.txt | 0

```

</details>
