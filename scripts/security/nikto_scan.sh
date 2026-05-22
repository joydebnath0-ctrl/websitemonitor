#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

REPORT_FILE="${REPORT_DIR}/nikto-report.txt"

nikto -h "$TARGET_URL" \
  -Format txt \
  -output "$REPORT_FILE" \
  -maxtime 300 \
  -Tuning 1234567890abc \
  2>&1 || true

cat "$REPORT_FILE"
