#!/usr/bin/env bash
set -euo pipefail

REPORT_DIR="${REPORT_DIR:-security-reports}"
TARGET_URL="${TARGET_URL:-https://example.com}"

mkdir -p "$REPORT_DIR"

target_host() {
  printf "%s" "$TARGET_URL" \
    | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##' \
    | cut -d'/' -f1 \
    | cut -d':' -f1
}

write_section() {
  local title="$1"
  local file="$2"

  {
    echo ""
    echo "--- ${title} ---"
  } | tee -a "$file"
}
