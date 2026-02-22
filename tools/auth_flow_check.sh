#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-http://127.0.0.1:1337}"
FAIL_COUNT=0

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

normalize_bool() {
  local raw="${1:-}"
  local fallback="${2:-false}"
  local lowered
  lowered="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  case "$lowered" in
    1|true|yes|on) echo "true" ;;
    0|false|no|off) echo "false" ;;
    "") echo "$fallback" ;;
    *) echo "$fallback" ;;
  esac
}

read_runtime_flag() {
  local key="$1"
  docker compose exec -T strapi printenv "$key" 2>/dev/null | tr -d '\r' | tail -n 1
}

request_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local output_file="$4"
  local ip="${5:-198.51.100.77}"

  if [[ -n "$body" ]]; then
    curl -sS --max-time 15 -o "$output_file" -w '%{http_code}' \
      -X "$method" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -H "X-Forwarded-For: ${ip}" \
      --data "$body" \
      "${API_BASE}${path}" || true
    return
  fi

  curl -sS --max-time 15 -o "$output_file" -w '%{http_code}' \
    -X "$method" \
    -H "Accept: application/json" \
    -H "X-Forwarded-For: ${ip}" \
    "${API_BASE}${path}" || true
}

wait_for_strapi_ready() {
  local attempts="${1:-30}"
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
echo "GEOVITO AUTH FLOW CHECK"
echo "API_BASE=${API_BASE}"
echo "=============================================================="

if wait_for_strapi_ready 45; then
  pass "strapi readiness check"
else
  fail "strapi readiness check failed (${API_BASE}/admin not ready)"
fi

register_enabled="$(normalize_bool "$(read_runtime_flag AUTH_LOCAL_REGISTER_ENABLED)" "true")"
google_enabled="$(normalize_bool "$(read_runtime_flag AUTH_GOOGLE_ENABLED)" "false")"
facebook_enabled="$(normalize_bool "$(read_runtime_flag AUTH_FACEBOOK_ENABLED)" "false")"
turnstile_enabled="$(normalize_bool "$(read_runtime_flag TURNSTILE_ENABLED)" "false")"

echo "Runtime flags:"
echo "  AUTH_LOCAL_REGISTER_ENABLED=${register_enabled}"
echo "  AUTH_GOOGLE_ENABLED=${google_enabled}"
echo "  AUTH_FACEBOOK_ENABLED=${facebook_enabled}"
echo "  TURNSTILE_ENABLED=${turnstile_enabled}"

tmp_register="$(mktemp)"
tmp_login="$(mktemp)"
tmp_forgot="$(mktemp)"
tmp_reset="$(mktemp)"
tmp_google="$(mktemp)"
tmp_facebook="$(mktemp)"
trap 'rm -f "$tmp_register" "$tmp_login" "$tmp_forgot" "$tmp_reset" "$tmp_google" "$tmp_facebook"' EXIT

register_payload='{"username":"","email":"invalid","password":"123"}'
register_status="$(request_json "POST" "/api/auth/local/register" "$register_payload" "$tmp_register" "203.0.113.10")"
if [[ "$register_enabled" == "false" ]]; then
  if [[ "$register_status" == "403" ]] && rg -q 'AuthRegistrationDisabled' "$tmp_register"; then
    pass "register endpoint locked when AUTH_LOCAL_REGISTER_ENABLED=false"
  else
    fail "register endpoint expected 403/AuthRegistrationDisabled, got status=${register_status}"
  fi
else
  if [[ "$turnstile_enabled" == "true" ]]; then
    if [[ "$register_status" == "403" ]] && rg -q 'TurnstileTokenMissing|TurnstileVerificationFailed' "$tmp_register"; then
      pass "register endpoint requires turnstile when TURNSTILE_ENABLED=true"
    else
      fail "register endpoint expected turnstile block (status=403), got status=${register_status}"
    fi
  elif [[ "$register_status" == "403" ]] && rg -q 'AuthRegistrationDisabled|Policy Failed' "$tmp_register"; then
    fail "register endpoint is blocked unexpectedly while AUTH_LOCAL_REGISTER_ENABLED=true"
  else
    pass "register endpoint reachable when AUTH_LOCAL_REGISTER_ENABLED=true (status=${register_status})"
  fi
fi

login_payload='{"identifier":"nobody@example.com","password":"wrong-password"}'
login_status="$(request_json "POST" "/api/auth/local" "$login_payload" "$tmp_login" "203.0.113.11")"
if [[ "$turnstile_enabled" == "true" ]]; then
  if [[ "$login_status" == "403" ]] && rg -q 'TurnstileTokenMissing|TurnstileVerificationFailed' "$tmp_login"; then
    pass "login endpoint requires turnstile when TURNSTILE_ENABLED=true"
  else
    fail "login endpoint expected turnstile block (status=403), got status=${login_status}"
  fi
else
  if [[ "$login_status" == "403" ]] || [[ "$login_status" == "429" ]]; then
    fail "login endpoint returned blocking status=${login_status}"
  else
    pass "login endpoint reachable (status=${login_status})"
  fi
fi

forgot_payload='{"email":"nobody@example.com"}'
forgot_status="$(request_json "POST" "/api/auth/forgot-password" "$forgot_payload" "$tmp_forgot" "203.0.113.20")"
if [[ "$turnstile_enabled" == "true" ]]; then
  if [[ "$forgot_status" == "403" ]] && rg -q 'TurnstileTokenMissing|TurnstileVerificationFailed' "$tmp_forgot"; then
    pass "forgot-password endpoint requires turnstile when TURNSTILE_ENABLED=true"
  else
    fail "forgot-password endpoint expected turnstile block (status=403), got status=${forgot_status}"
  fi
else
  if [[ "$forgot_status" == "200" ]]; then
    pass "forgot-password endpoint reachable (status=${forgot_status})"
  else
    fail "forgot-password endpoint expected status=200, got status=${forgot_status}"
  fi
fi

reset_payload='{"code":"invalid-code","password":"TempPassw0rd!","passwordConfirmation":"TempPassw0rd!"}'
reset_status="$(request_json "POST" "/api/auth/reset-password" "$reset_payload" "$tmp_reset" "203.0.113.21")"
if [[ "$turnstile_enabled" == "true" ]]; then
  if [[ "$reset_status" == "403" ]] && rg -q 'TurnstileTokenMissing|TurnstileVerificationFailed' "$tmp_reset"; then
    pass "reset-password endpoint requires turnstile when TURNSTILE_ENABLED=true"
  else
    fail "reset-password endpoint expected turnstile block (status=403), got status=${reset_status}"
  fi
else
  if [[ "$reset_status" == "400" ]]; then
    pass "reset-password endpoint invalid-code check works (status=${reset_status})"
  else
    fail "reset-password invalid-code expected status=400, got status=${reset_status}"
  fi
fi

google_status="$(request_json "GET" "/api/connect/google" "" "$tmp_google" "203.0.113.12")"
if [[ "$google_enabled" == "false" ]]; then
  if [[ "$google_status" == "403" ]] && rg -q 'AuthProviderDisabled' "$tmp_google"; then
    pass "google connect blocked when AUTH_GOOGLE_ENABLED=false"
  else
    fail "google connect expected 403/AuthProviderDisabled, got status=${google_status}"
  fi
else
  if [[ "$google_status" == "403" ]] && rg -q 'AuthProviderDisabled' "$tmp_google"; then
    fail "google connect unexpectedly blocked while AUTH_GOOGLE_ENABLED=true"
  else
    pass "google connect not force-blocked (status=${google_status})"
  fi
fi

facebook_status="$(request_json "GET" "/api/connect/facebook" "" "$tmp_facebook" "203.0.113.13")"
if [[ "$facebook_enabled" == "false" ]]; then
  if [[ "$facebook_status" == "403" ]] && rg -q 'AuthProviderDisabled' "$tmp_facebook"; then
    pass "facebook connect blocked when AUTH_FACEBOOK_ENABLED=false"
  else
    fail "facebook connect expected 403/AuthProviderDisabled, got status=${facebook_status}"
  fi
else
  if [[ "$facebook_status" == "403" ]] && rg -q 'AuthProviderDisabled' "$tmp_facebook"; then
    fail "facebook connect unexpectedly blocked while AUTH_FACEBOOK_ENABLED=true"
  else
    pass "facebook connect not force-blocked (status=${facebook_status})"
  fi
fi

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "=============================================================="
  echo "AUTH FLOW CHECK: FAIL (${FAIL_COUNT} issue)"
  echo "=============================================================="
  exit 1
fi

echo "=============================================================="
echo "AUTH FLOW CHECK: PASS"
echo "=============================================================="
exit 0
