#!/usr/bin/env bash
set -euo pipefail

TARGETS_JSON="${1:-audit-targets.json}"
SUMMARY_FILE="all-reports/poc-summary.txt"
REQUIRED_HEADERS=(
  "Strict-Transport-Security"
  "X-Frame-Options"
  "X-Content-Type-Options"
  "Content-Security-Policy"
  "Referrer-Policy"
  "Permissions-Policy"
)

mkdir -p all-reports
printf "%-32s | %-24s | %-45s | %s\n" "Slug" "Check" "File" "Finding Count" > "$SUMMARY_FILE"
printf "%-32s-+-%-24s-+-%-45s-+-%s\n" "$(printf '%0.s-' {1..32})" "$(printf '%0.s-' {1..24})" "$(printf '%0.s-' {1..45})" "$(printf '%0.s-' {1..13})" >> "$SUMMARY_FILE"

target_host() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import urlparse

value = sys.argv[1]
parsed = urlparse(value)
host = parsed.netloc or parsed.path
host = host.split("@")[-1].split(":")[0]
print(host)
PY
}

append_summary() {
  local slug="$1"
  local check="$2"
  local file="$3"
  local count="$4"

  printf "%-32s | %-24s | %-45s | %s\n" "$slug" "$check" "$file" "$count" >> "$SUMMARY_FILE"
}

missing_header_count() {
  local file="$1"
  grep -c '^-' "$file" 2>/dev/null || true
}

open_port_count() {
  local file="$1"
  grep -Ec '^[0-9]+/tcp[[:space:]]+open' "$file" 2>/dev/null || true
}

while IFS=$'\t' read -r url slug; do
  [ -n "$url" ] || continue

  host="$(target_host "$url")"
  poc_dir="all-reports/${slug}/poc"
  mkdir -p "$poc_dir"

  headers_file="${poc_dir}/headers.txt"
  curl -sI "$url" > "$headers_file" || true
  {
    echo ""
    echo "MISSING HEADERS:"
    missing=0
    for header in "${REQUIRED_HEADERS[@]}"; do
      if ! grep -iq "^${header}:" "$headers_file"; then
        echo "- ${header}"
        missing=$((missing + 1))
      fi
    done
    if [ "$missing" -eq 0 ]; then
      echo "None"
    fi
  } >> "$headers_file"
  append_summary "$slug" "Header proof" "${slug}/poc/headers.txt" "$(missing_header_count "$headers_file")"

  tls_handshake_file="${poc_dir}/tls-handshake.txt"
  echo | openssl s_client -connect "${host}:443" -servername "$host" > "$tls_handshake_file" 2>&1 || true
  append_summary "$slug" "TLS handshake" "${slug}/poc/tls-handshake.txt" "$(grep -Eci 'verify error|error|alert|expired|self-signed' "$tls_handshake_file" 2>/dev/null || true)"

  tls_ciphers_file="${poc_dir}/tls-ciphers.txt"
  nmap --script ssl-enum-ciphers -p 443 "$host" > "$tls_ciphers_file" 2>&1 || true
  append_summary "$slug" "TLS ciphers" "${slug}/poc/tls-ciphers.txt" "$(grep -Eci 'weak|vulnerable|least strength|SSLv3|TLSv1\.0|TLSv1\.1' "$tls_ciphers_file" 2>/dev/null || true)"

  open_ports_file="${poc_dir}/open-ports.txt"
  nmap -T4 --open "$host" > "$open_ports_file" 2>&1 || true
  {
    echo ""
    echo "BANNER GRAB RESULTS:"
    grep -E '^[0-9]+/tcp[[:space:]]+open' "$open_ports_file" | awk -F/ '{print $1}' | while read -r port; do
      [ -n "$port" ] || continue
      if [ "$port" = "80" ] || [ "$port" = "443" ]; then
        continue
      fi
      echo ""
      echo "Port ${port}:"
      nc -zv -w3 "$host" "$port" 2>&1 || true
    done
  } >> "$open_ports_file"
  append_summary "$slug" "Open ports" "${slug}/poc/open-ports.txt" "$(open_port_count "$open_ports_file")"

  redirect_file="${poc_dir}/redirect-chain.txt"
  curl -sI --max-redirs 10 -L "http://${host}" > "$redirect_file" || true
  append_summary "$slug" "Redirect chain" "${slug}/poc/redirect-chain.txt" "$(grep -Eci '^location:|^HTTP/' "$redirect_file" 2>/dev/null || true)"

  zap_evidence_file="${poc_dir}/zap-high-findings.txt"
  zap_json="all-reports/${slug}/zap/zap-full-scan.json"
  if [ -s "$zap_json" ]; then
    python3 - "$zap_json" > "$zap_evidence_file" <<'PY'
import json
import sys

path = sys.argv[1]
try:
    with open(path, encoding="utf-8", errors="replace") as handle:
        data = json.load(handle)
except Exception as exc:
    print(f"Unable to parse ZAP scan results: {exc}")
    sys.exit(0)

alerts = []
for site in data.get("site", []):
    for alert in site.get("alerts", []):
        try:
            riskcode = int(alert.get("riskcode", 0))
        except (TypeError, ValueError):
            riskcode = 0
        if riskcode >= 2:
            instances = alert.get("instances") or [{}]
            for instance in instances:
                alerts.append((alert, instance))

if not alerts:
    print("No ZAP medium, high, or critical findings found.")
else:
    for index, (alert, instance) in enumerate(alerts, 1):
        print(f"Finding #{index}")
        print(f"pluginId: {alert.get('pluginid', alert.get('pluginId', ''))}")
        print(f"alert: {alert.get('alert', '')}")
        print(f"riskdesc: {alert.get('riskdesc', '')}")
        print(f"url: {instance.get('uri', instance.get('url', ''))}")
        print(f"evidence: {instance.get('evidence', alert.get('evidence', ''))}")
        print(f"solution: {alert.get('solution', '')}")
        print("")
PY
  else
    echo "ZAP scan results not available." > "$zap_evidence_file"
  fi
  append_summary "$slug" "ZAP evidence" "${slug}/poc/zap-high-findings.txt" "$(grep -c '^Finding #' "$zap_evidence_file" 2>/dev/null || true)"
done < <(
  python3 - "$TARGETS_JSON" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    matrix = json.load(handle)

for target in matrix.get("include", []):
    print(f"{target['url']}\t{target['slug']}")
PY
)
