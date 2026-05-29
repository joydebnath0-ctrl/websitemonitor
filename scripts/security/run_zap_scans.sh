#!/usr/bin/env bash
set -euo pipefail

TARGETS_JSON="${1:-audit-targets.json}"
ZAP_SCAN_MODE="${ZAP_SCAN_MODE:-baseline}"
ZAP_MAX_MINUTES="${ZAP_MAX_MINUTES:-12}"
ZAP_IMAGE="${ZAP_IMAGE:-ghcr.io/zaproxy/zaproxy:stable}"

run_with_timeout() {
  local label="$1"
  shift

  echo "Running ${label} with ${ZAP_MAX_MINUTES} minute timeout"
  timeout "${ZAP_MAX_MINUTES}m" "$@" || {
    status=$?
    if [ "$status" -eq 124 ]; then
      echo "WARNING: ${label} timed out after ${ZAP_MAX_MINUTES} minutes."
    else
      echo "WARNING: ${label} exited with status ${status}."
    fi
    return 0
  }
}

while IFS=$'\t' read -r url slug; do
  [ -n "$url" ] || continue

  zap_dir="all-reports/${slug}/zap"
  mkdir -p "$zap_dir"
  chmod -R 777 "$zap_dir"

  if [ "$ZAP_SCAN_MODE" = "skip" ]; then
    echo "ZAP scan skipped for ${url}." | tee "${zap_dir}/zap-skipped.txt"
    continue
  fi

  echo "=== Running OWASP ZAP ${ZAP_SCAN_MODE} scan for ${url} ==="

  run_with_timeout "ZAP baseline scan for ${slug}" \
    docker run --rm \
      -v "${PWD}/${zap_dir}:/zap/wrk:rw" \
      "$ZAP_IMAGE" \
      zap-baseline.py \
      -t "$url" \
      -m 2 \
      -J "zap-baseline.json" \
      -r "zap-baseline.html" \
      -w "zap-baseline.md"

  if [ "$ZAP_SCAN_MODE" = "full" ]; then
    run_with_timeout "ZAP full scan for ${slug}" \
      docker run --rm \
        -v "${PWD}/${zap_dir}:/zap/wrk:rw" \
        "$ZAP_IMAGE" \
        zap-full-scan.py \
        -t "$url" \
        -m 3 \
        -J "zap-full-scan.json" \
        -r "zap-full-scan.html" \
        -w "zap-full-scan.md"
  fi
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
