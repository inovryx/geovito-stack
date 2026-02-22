#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-http://127.0.0.1:1337}"
PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-https://www.geovito.com}"
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

normalize_origin() {
  local input="$1"
  local trimmed="${input%/}"
  if [[ -z "$trimmed" ]]; then
    echo "https://www.geovito.com"
    return
  fi
  echo "$trimmed"
}

origin_host() {
  local input="$1"
  local host="${input#http://}"
  host="${host#https://}"
  host="${host%%/*}"
  echo "$host"
}

read_runtime_flag() {
  local key="$1"
  docker compose exec -T strapi printenv "$key" 2>/dev/null | tr -d '\r' | tail -n 1
}

encode_url_minimal() {
  local value="$1"
  printf '%s' "$value" \
    | sed -e 's/%/%25/g' -e 's/:/%3A/g' -e 's/\//%2F/g' -e 's/?/%3F/g' -e 's/&/%26/g' -e 's/=/%3D/g'
}

extract_location() {
  local headers_file="$1"
  awk 'BEGIN{IGNORECASE=1} /^Location:/ {sub(/\r$/, "", $2); print $2; exit}' "$headers_file"
}

provider_location_regex() {
  local provider="$1"
  case "$provider" in
    google) echo 'accounts\.google\.com|google\.com/o/oauth2|googleusercontent\.com' ;;
    facebook) echo 'facebook\.com' ;;
    *) echo '' ;;
  esac
}

is_local_http_api_base() {
  printf '%s' "$API_BASE" | rg -q '^http://(127\.0\.0\.1|localhost)(:[0-9]+)?$'
}

supports_local_secure_cookie_fallback() {
  local provider="$1"
  local body_file="$2"

  if ! is_local_http_api_base; then
    return 1
  fi

  if ! rg -q '^Internal Server Error$' "$body_file"; then
    return 1
  fi

  local logs
  logs="$(docker compose logs --tail=160 strapi 2>/dev/null || true)"
  if [[ -z "$logs" ]]; then
    return 1
  fi

  if printf '%s' "$logs" | rg -q "\"path\":\"/api/connect/${provider}\".*\"status\":302" \
    && printf '%s' "$logs" | rg -q 'Cannot send secure cookie over unencrypted connection'; then
    return 0
  fi

  return 1
}

check_provider() {
  local provider="$1"
  local enabled="$2"
  local remote_ip="$3"
  local endpoint="/api/connect/${provider}"
  local callback_connect="${PUBLIC_SITE_URL}/api/connect/${provider}/callback"
  local callback_auth="${PUBLIC_SITE_URL}/api/auth/${provider}/callback"

  if [[ "$enabled" != "true" ]]; then
    pass "${provider} oauth skipped (AUTH_${provider^^}_ENABLED=false)"
    return
  fi

  local headers_file body_file status location regex
  headers_file="$(mktemp)"
  body_file="$(mktemp)"
  trap 'rm -f "$headers_file" "$body_file"' RETURN

  local forwarded_host
  forwarded_host="$(origin_host "$PUBLIC_SITE_URL")"

  status="$(
    curl -sS --max-time 15 -D "$headers_file" -o "$body_file" -w '%{http_code}' \
      -H "Accept: application/json" \
      -H "X-Forwarded-For: ${remote_ip}" \
      -H "X-Forwarded-Proto: https" \
      -H "X-Forwarded-Host: ${forwarded_host}" \
      "${API_BASE}${endpoint}" || true
  )"

  if [[ ! "$status" =~ ^30[1278]$ && ! "$status" =~ ^303$ && ! "$status" =~ ^302$ ]]; then
    if supports_local_secure_cookie_fallback "$provider" "$body_file"; then
      pass "${provider} oauth redirect observed in logs (local http secure-cookie limitation)"
      return
    fi

    fail "${provider} oauth expected redirect status, got ${status}"
    echo "      body: $(tr '\n' ' ' < "$body_file" | head -c 220)"
    return
  fi

  location="$(extract_location "$headers_file")"
  if [[ -z "$location" ]]; then
    fail "${provider} oauth redirect missing Location header"
    return
  fi

  regex="$(provider_location_regex "$provider")"
  if [[ -n "$regex" ]] && ! printf '%s' "$location" | grep -Eqi "$regex"; then
    fail "${provider} oauth redirect host mismatch (location=${location})"
    return
  fi

  local callback_match=false
  local callback candidate callback_encoded
  for callback in "$callback_connect" "$callback_auth"; do
    callback_encoded="$(encode_url_minimal "$callback")"
    for candidate in "$callback" "$callback_encoded"; do
      if [[ "$location" == *"$candidate"* ]]; then
        callback_match=true
        break
      fi
    done
    if [[ "$callback_match" == true ]]; then
      break
    fi
  done

  if [[ "$callback_match" != true ]]; then
    fail "${provider} oauth callback mismatch (expected connect/auth callback for ${PUBLIC_SITE_URL})"
    echo "      expected one of: ${callback_connect} | ${callback_auth}"
    echo "      location: ${location}"
    return
  fi

  pass "${provider} oauth redirect + callback verified"
}

PUBLIC_SITE_URL="$(normalize_origin "$PUBLIC_SITE_URL")"
google_enabled="$(normalize_bool "$(read_runtime_flag AUTH_GOOGLE_ENABLED)" "false")"
facebook_enabled="$(normalize_bool "$(read_runtime_flag AUTH_FACEBOOK_ENABLED)" "false")"

echo "=============================================================="
echo "GEOVITO OAUTH CONFIG CHECK"
echo "API_BASE=${API_BASE}"
echo "PUBLIC_SITE_URL=${PUBLIC_SITE_URL}"
echo "=============================================================="
echo "Runtime flags:"
echo "  AUTH_GOOGLE_ENABLED=${google_enabled}"
echo "  AUTH_FACEBOOK_ENABLED=${facebook_enabled}"

check_provider "google" "$google_enabled" "203.0.113.14"
check_provider "facebook" "$facebook_enabled" "203.0.113.15"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "=============================================================="
  echo "OAUTH CONFIG CHECK: FAIL (${FAIL_COUNT} issue)"
  echo "=============================================================="
  exit 1
fi

echo "=============================================================="
echo "OAUTH CONFIG CHECK: PASS"
echo "=============================================================="
exit 0
