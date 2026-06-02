#!/usr/bin/env bash
set -euo pipefail

TARGETS_JSON="${1:-audit-targets.json}"

while IFS=$'\t' read -r url slug; do
  [ -n "$url" ] || continue

  echo "=== Running domain scans for ${url} ==="
  export TARGET_URL="$url"
  export REPORT_DIR="all-reports/${slug}"
  mkdir -p "$REPORT_DIR"

  bash scripts/security/headers_scan.sh || true
  bash scripts/security/dns_security_scan.sh || true
  bash scripts/security/cookie_scan.sh || true
  bash scripts/security/ssl_tls_scan.sh || true
  bash scripts/security/port_scan.sh || true
  bash scripts/security/nikto_scan.sh || true
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

bash scripts/security/capture_page_speed.sh "$TARGETS_JSON"
