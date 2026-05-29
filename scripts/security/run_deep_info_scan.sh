#!/usr/bin/env bash
set -euo pipefail

TARGETS_JSON="${1:-audit-targets.json}"
SCAN_DEPTH="${SCAN_DEPTH:-standard}"
DEEP_MAX_SECONDS="${DEEP_MAX_SECONDS:-45}"

if [ "$SCAN_DEPTH" != "deep" ]; then
  echo "Deep information gathering skipped. Set scan_depth=deep in manual workflow dispatch to enable it."
  exit 0
fi

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

run_capture() {
  local output_file="$1"
  shift

  timeout "${DEEP_MAX_SECONDS}s" "$@" > "$output_file" 2>&1 || {
    status=$?
    if [ "$status" -eq 124 ]; then
      echo "" >> "$output_file"
      echo "WARNING: command timed out after ${DEEP_MAX_SECONDS} seconds." >> "$output_file"
    else
      echo "" >> "$output_file"
      echo "WARNING: command exited with status ${status}." >> "$output_file"
    fi
  }
}

while IFS=$'\t' read -r url slug; do
  [ -n "$url" ] || continue

  host="$(target_host "$url")"
  deep_dir="all-reports/${slug}/deep"
  mkdir -p "$deep_dir"

  {
    echo "Deep information gathering"
    echo "Target URL: ${url}"
    echo "Host: ${host}"
    echo "Generated UTC: $(date -u '+%Y-%m-%d %H:%M:%S')"
  } > "${deep_dir}/deep-summary.txt"

  run_capture "${deep_dir}/http-fingerprint.txt" curl -sS -L -I --max-time 20 "$url"

  {
    echo "curl timings for ${url}"
    curl -o /dev/null -sS -L --max-time 30 \
      -w $'dns_lookup: %{time_namelookup}s\nconnect: %{time_connect}s\ntls: %{time_appconnect}s\nstart_transfer: %{time_starttransfer}s\ntotal: %{time_total}s\nhttp_code: %{http_code}\nredirects: %{num_redirects}\nsize_download: %{size_download} bytes\n' \
      "$url" || true
  } > "${deep_dir}/page-timing.txt" 2>&1

  {
    echo "DNS records for ${host}"
    echo ""
    for type in A AAAA CNAME NS MX TXT CAA SOA; do
      echo "## ${type}"
      dig +short "$type" "$host" || true
      echo ""
    done
  } > "${deep_dir}/dns-records.txt" 2>&1

  run_capture "${deep_dir}/tls-certificate-chain.txt" openssl s_client -showcerts -connect "${host}:443" -servername "$host"

  run_capture "${deep_dir}/web-service-enum.txt" nmap -sV -Pn --top-ports 25 --open \
    --script http-title,http-server-header,http-methods \
    "$host"

  {
    echo "Common discovery files"
    for path in "/robots.txt" "/sitemap.xml" "/.well-known/security.txt" "/humans.txt" "/.well-known/change-password"; do
      echo ""
      echo "## ${path}"
      curl -sS -L -I --max-time 15 "https://${host}${path}" || true
    done
  } > "${deep_dir}/common-files.txt" 2>&1
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
