#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-http://127.0.0.1:1337}"
RESET_SMOKE_EMAIL="${RESET_SMOKE_EMAIL:-${EMAIL_SMOKE_TO:-}}"
FAIL_COUNT=0

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

request_json() {
  local method="$1"
  local path="$2"
  local body="$3"
  local output_file="$4"

  curl -sS --max-time 20 -o "$output_file" -w '%{http_code}' \
    -X "$method" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    --data "$body" \
    "${API_BASE}${path}" || true
}

wait_for_strapi_ready() {
  local attempts="${1:-45}"
  local i=0
  while [[ "$i" -lt "$attempts" ]]; do
    if curl -fsS --max-time 5 "${API_BASE}/admin" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

echo "=============================================================="
echo "GEOVITO PASSWORD RESET SMOKE"
echo "API_BASE=${API_BASE}"
echo "=============================================================="

SKIP_STRAPI=1 bash tools/smtp_config_check.sh

if ! wait_for_strapi_ready 45; then
  fail "strapi readiness check failed"
  echo "=============================================================="
  echo "PASSWORD RESET SMOKE: FAIL (${FAIL_COUNT} issue)"
  echo "=============================================================="
  exit 1
fi
pass "strapi readiness check"

if [[ -z "$RESET_SMOKE_EMAIL" ]]; then
  fail "RESET_SMOKE_EMAIL is required (example: RESET_SMOKE_EMAIL=you@example.com)"
  echo "=============================================================="
  echo "PASSWORD RESET SMOKE: FAIL (${FAIL_COUNT} issue)"
  echo "=============================================================="
  exit 1
fi
pass "RESET_SMOKE_EMAIL is set"

tmp_forgot="$(mktemp)"
tmp_reset="$(mktemp)"
trap 'rm -f "$tmp_forgot" "$tmp_reset"' EXIT

forgot_payload="{\"email\":\"${RESET_SMOKE_EMAIL}\"}"
forgot_status="$(request_json "POST" "/api/auth/forgot-password" "$forgot_payload" "$tmp_forgot")"
if [[ "$forgot_status" == "200" ]]; then
  pass "forgot-password request accepted (status=200)"
else
  fail "forgot-password expected status=200, got status=${forgot_status}"
fi

reset_payload='{"code":"invalid-code","password":"TempPassw0rd!","passwordConfirmation":"TempPassw0rd!"}'
reset_status="$(request_json "POST" "/api/auth/reset-password" "$reset_payload" "$tmp_reset")"
if [[ "$reset_status" == "400" ]]; then
  pass "reset-password invalid token check works (status=400)"
else
  fail "reset-password invalid token expected status=400, got status=${reset_status}"
fi

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "=============================================================="
  echo "PASSWORD RESET SMOKE: FAIL (${FAIL_COUNT} issue)"
  echo "=============================================================="
  exit 1
fi

echo "NOTE: SMTP send request was accepted. Check mailbox inbox/spam for reset email:"
echo "  ${RESET_SMOKE_EMAIL}"
echo "=============================================================="
echo "PASSWORD RESET SMOKE: PASS"
echo "=============================================================="
exit 0
