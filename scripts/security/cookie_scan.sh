#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

REPORT_FILE="${REPORT_DIR}/cookie-report.txt"

echo "=== Cookie Security Analysis ===" | tee "$REPORT_FILE"
echo "Target: ${TARGET_URL}" | tee -a "$REPORT_FILE"

COOKIES="$(curl -sI --max-time 15 -L "$TARGET_URL" | grep -i "set-cookie" || true)"

if [ -z "$COOKIES" ]; then
  echo "No Set-Cookie headers found on initial response." | tee -a "$REPORT_FILE"
else
  echo "$COOKIES" | while IFS= read -r line; do
    echo "Cookie: ${line}" | tee -a "$REPORT_FILE"

    echo "$line" | grep -iq "HttpOnly" \
      && echo "  HttpOnly flag set" | tee -a "$REPORT_FILE" \
      || echo "  MISSING HttpOnly flag. Cookie may be exposed to XSS theft." | tee -a "$REPORT_FILE"

    echo "$line" | grep -iq "Secure" \
      && echo "  Secure flag set" | tee -a "$REPORT_FILE" \
      || echo "  MISSING Secure flag. Cookie may be sent over HTTP." | tee -a "$REPORT_FILE"

    echo "$line" | grep -iq "SameSite" \
      && echo "  SameSite attribute set" | tee -a "$REPORT_FILE" \
      || echo "  MISSING SameSite. Cookie may be more exposed to CSRF." | tee -a "$REPORT_FILE"

    echo "" >> "$REPORT_FILE"
  done
fi
