#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

HOST="$(target_host)"
REPORT_FILE="${REPORT_DIR}/ports-report.txt"
NMAP_FILE="${REPORT_DIR}/ports-nmap.txt"

echo "=== Open Port Scan for ${HOST} ===" | tee "$REPORT_FILE"

nmap -sV --open \
  -p 21,22,23,25,53,80,110,143,443,445,3306,3389,5432,6379,8080,8443,8888,9200,27017 \
  --script=banner,http-title,ssl-cert \
  -oN "$NMAP_FILE" \
  "$HOST" 2>&1 | tee -a "$REPORT_FILE" || true

write_section "Risk Assessment of Open Ports" "$REPORT_FILE"
for RISKY_PORT in 21 22 23 25 3306 5432 6379 27017; do
  if grep -q "${RISKY_PORT}/tcp.*open" "$NMAP_FILE" 2>/dev/null; then
    echo "Port ${RISKY_PORT} is open. Verify this is intentionally exposed." | tee -a "$REPORT_FILE"
  fi
done
