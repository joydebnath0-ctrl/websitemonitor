#!/usr/bin/env bash
set -euo pipefail

TARGETS_JSON="${1:-audit-targets.json}"
MAX_SECONDS="${PAGE_SPEED_MAX_SECONDS:-30}"

capture_target() {
  local url="$1"
  local slug="$2"
  local report_dir="all-reports/${slug}"
  local output_file="${report_dir}/page-speed-report.txt"

  mkdir -p "$report_dir"

  {
    echo "=== Page Speed Timing Report ==="
    echo "Target: ${url}"
    echo "Generated UTC: $(date -u '+%Y-%m-%d %H:%M:%S')"
    echo ""
    curl -o /dev/null -sS -L --connect-timeout 10 --max-time "$MAX_SECONDS" \
      -w $'dns_lookup: %{time_namelookup}s\nconnect: %{time_connect}s\ntls: %{time_appconnect}s\nstart_transfer: %{time_starttransfer}s\ntotal: %{time_total}s\nhttp_code: %{http_code}\nredirects: %{num_redirects}\nsize_download: %{size_download} bytes\nspeed_download: %{speed_download} bytes/sec\nfinal_url: %{url_effective}\n' \
      "$url" || true
  } > "$output_file" 2>&1
}

while IFS=$'\t' read -r url slug; do
  [ -n "$url" ] || continue
  capture_target "$url" "$slug"
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
