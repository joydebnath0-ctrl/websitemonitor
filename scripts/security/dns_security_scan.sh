#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

HOST="$(target_host)"
REPORT_FILE="${REPORT_DIR}/dns-report.txt"

echo "=== DNS Security Report for ${HOST} ===" | tee "$REPORT_FILE"

write_section "A / AAAA Records" "$REPORT_FILE"
dig +short A "$HOST" | tee -a "$REPORT_FILE"
dig +short AAAA "$HOST" | tee -a "$REPORT_FILE"

write_section "DNSSEC Validation" "$REPORT_FILE"
dig +dnssec "$HOST" | grep -E "RRSIG|NSEC|AD" | tee -a "$REPORT_FILE" \
  || echo "No DNSSEC records found" | tee -a "$REPORT_FILE"

write_section "SPF Record" "$REPORT_FILE"
SPF="$(dig +short TXT "$HOST" | grep "v=spf1" || true)"
if [ -z "$SPF" ]; then
  echo "MISSING: No SPF record found" | tee -a "$REPORT_FILE"
else
  echo "SPF: ${SPF}" | tee -a "$REPORT_FILE"
fi

write_section "DMARC Record" "$REPORT_FILE"
DMARC="$(dig +short TXT "_dmarc.${HOST}" | grep "v=DMARC1" || true)"
if [ -z "$DMARC" ]; then
  echo "MISSING: No DMARC record found" | tee -a "$REPORT_FILE"
else
  echo "DMARC: ${DMARC}" | tee -a "$REPORT_FILE"
fi

write_section "MX Records" "$REPORT_FILE"
dig +short MX "$HOST" | tee -a "$REPORT_FILE"

write_section "CAA Records" "$REPORT_FILE"
CAA="$(dig +short CAA "$HOST" || true)"
if [ -z "$CAA" ]; then
  echo "No CAA records found. Any CA may be able to issue certificates for this domain." | tee -a "$REPORT_FILE"
else
  echo "CAA: ${CAA}" | tee -a "$REPORT_FILE"
fi
