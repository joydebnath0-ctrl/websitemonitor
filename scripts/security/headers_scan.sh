#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

REPORT_FILE="${REPORT_DIR}/headers-report.txt"

echo "=== HTTP Security Headers Report ===" | tee "$REPORT_FILE"
echo "Target: ${TARGET_URL}" | tee -a "$REPORT_FILE"

HEADERS="$(curl -sI --max-time 15 -L "$TARGET_URL" || true)"

write_section "Raw Headers" "$REPORT_FILE"
echo "$HEADERS" | tee -a "$REPORT_FILE"

write_section "Security Header Analysis" "$REPORT_FILE"

declare -A REQUIRED_HEADERS=(
  ["Strict-Transport-Security"]="HSTS forces HTTPS connections"
  ["Content-Security-Policy"]="CSP helps prevent XSS and data injection"
  ["X-Content-Type-Options"]="Prevents MIME-type sniffing"
  ["X-Frame-Options"]="Helps prevent clickjacking attacks"
  ["Referrer-Policy"]="Controls referrer information"
  ["Permissions-Policy"]="Controls browser feature access"
  ["X-XSS-Protection"]="Legacy XSS filter"
  ["Cache-Control"]="Controls caching behavior"
)

MISSING=0
for HEADER in "${!REQUIRED_HEADERS[@]}"; do
  VALUE="$(echo "$HEADERS" | grep -i "^${HEADER}:" | head -1 || true)"
  if [ -z "$VALUE" ]; then
    echo "MISSING: ${HEADER} - ${REQUIRED_HEADERS[$HEADER]}" | tee -a "$REPORT_FILE"
    MISSING=$((MISSING + 1))
  else
    echo "PRESENT: ${VALUE}" | tee -a "$REPORT_FILE"
  fi
done

echo "" | tee -a "$REPORT_FILE"
echo "Total missing headers: ${MISSING}" | tee -a "$REPORT_FILE"

if [ "$MISSING" -gt 3 ]; then
  echo "::warning::${MISSING} required security headers are missing."
fi
