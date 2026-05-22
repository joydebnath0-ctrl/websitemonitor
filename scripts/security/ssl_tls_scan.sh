#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

HOST="$(target_host)"
REPORT_FILE="${REPORT_DIR}/ssl-report.txt"

echo "=== SSL Certificate Report for ${HOST} ===" | tee "$REPORT_FILE"

write_section "Certificate Expiry" "$REPORT_FILE"
EXPIRY="$(
  echo | openssl s_client -servername "$HOST" -connect "${HOST}:443" 2>/dev/null \
    | openssl x509 -noout -dates 2>/dev/null || true
)"
echo "$EXPIRY" | tee -a "$REPORT_FILE"

NOT_AFTER="$(echo "$EXPIRY" | grep notAfter | cut -d'=' -f2 || true)"
if [ -n "$NOT_AFTER" ]; then
  DAYS_LEFT=$(( ( "$(date -d "$NOT_AFTER" +%s)" - "$(date +%s)" ) / 86400 ))
  echo "Days until expiry: ${DAYS_LEFT}" | tee -a "$REPORT_FILE"

  if [ "$DAYS_LEFT" -lt 30 ]; then
    echo "WARNING: Certificate expires in less than 30 days." | tee -a "$REPORT_FILE"
  fi
fi

write_section "Certificate Subject and SANs" "$REPORT_FILE"
echo | openssl s_client -servername "$HOST" -connect "${HOST}:443" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -ext subjectAltName 2>/dev/null \
  | tee -a "$REPORT_FILE" || true

write_section "Supported TLS Versions" "$REPORT_FILE"
for version in ssl3 tls1 tls1_1 tls1_2 tls1_3; do
  RESULT="$(echo | openssl s_client "-${version}" -connect "${HOST}:443" 2>&1 | grep -E "Cipher|CONNECTED|error" || true)"
  echo "${version}: ${RESULT}" | tee -a "$REPORT_FILE"
done

write_section "testssl.sh" "$REPORT_FILE"
docker run --rm \
  -v "${PWD}/${REPORT_DIR}:/reports" \
  drwetter/testssl.sh \
  --jsonfile /reports/testssl-output.json \
  --severity MEDIUM \
  --quiet \
  "$HOST" 2>&1 | tee "${REPORT_DIR}/testssl-report.txt" || true
