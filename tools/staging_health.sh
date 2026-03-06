#!/usr/bin/env bash
set -euo pipefail

INPUT_STAGING_BASE_URL="${STAGING_BASE_URL-}"
INPUT_STAGING_API_BASE="${STAGING_API_BASE-}"
INPUT_STAGING_HEALTH_TOKEN="${STAGING_HEALTH_TOKEN-}"
INPUT_STAGING_CF_ACCESS_CLIENT_ID="${STAGING_CF_ACCESS_CLIENT_ID-}"
INPUT_STAGING_CF_ACCESS_CLIENT_SECRET="${STAGING_CF_ACCESS_CLIENT_SECRET-}"

STAGING_ENV_FILE="${STAGING_ENV_FILE:-$HOME/.config/geovito/staging.env}"
if [[ -f "$STAGING_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$STAGING_ENV_FILE"
fi

[[ -n "$INPUT_STAGING_BASE_URL" ]] && STAGING_BASE_URL="$INPUT_STAGING_BASE_URL"
[[ -n "$INPUT_STAGING_API_BASE" ]] && STAGING_API_BASE="$INPUT_STAGING_API_BASE"
[[ -n "$INPUT_STAGING_HEALTH_TOKEN" ]] && STAGING_HEALTH_TOKEN="$INPUT_STAGING_HEALTH_TOKEN"
[[ -n "$INPUT_STAGING_CF_ACCESS_CLIENT_ID" ]] && STAGING_CF_ACCESS_CLIENT_ID="$INPUT_STAGING_CF_ACCESS_CLIENT_ID"
[[ -n "$INPUT_STAGING_CF_ACCESS_CLIENT_SECRET" ]] && STAGING_CF_ACCESS_CLIENT_SECRET="$INPUT_STAGING_CF_ACCESS_CLIENT_SECRET"

STAGING_BASE_URL="${STAGING_BASE_URL:-}"
STAGING_API_BASE="${STAGING_API_BASE:-}"
STAGING_HEALTH_TOKEN="${STAGING_HEALTH_TOKEN:-}"
STAGING_CF_ACCESS_CLIENT_ID="${STAGING_CF_ACCESS_CLIENT_ID:-}"
STAGING_CF_ACCESS_CLIENT_SECRET="${STAGING_CF_ACCESS_CLIENT_SECRET:-}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

[[ -n "$STAGING_BASE_URL" ]] || fail "STAGING_BASE_URL is required"
[[ -n "$STAGING_API_BASE" ]] || fail "STAGING_API_BASE is required"

hdrs=()
if [[ -n "$STAGING_CF_ACCESS_CLIENT_ID" && -n "$STAGING_CF_ACCESS_CLIENT_SECRET" ]]; then
  hdrs+=( -H "CF-Access-Client-Id: ${STAGING_CF_ACCESS_CLIENT_ID}" )
  hdrs+=( -H "CF-Access-Client-Secret: ${STAGING_CF_ACCESS_CLIENT_SECRET}" )
fi

code_build="$(curl -sS -o /tmp/staging-build.json -w '%{http_code}' "${hdrs[@]}" "${STAGING_BASE_URL}/.well-known/geovito-build.json" || true)"
[[ "$code_build" == "200" ]] || fail "staging build fingerprint status=${code_build}"
if rg -q '"build_sha7"' /tmp/staging-build.json; then
  pass "staging build fingerprint reachable"
else
  fail "staging build fingerprint payload invalid"
fi

health_headers=()
if [[ -n "$STAGING_HEALTH_TOKEN" ]]; then
  health_headers+=( -H "x-health-token: ${STAGING_HEALTH_TOKEN}" )
fi

code_health="$(curl -sS -o /tmp/staging-health.json -w '%{http_code}' "${health_headers[@]}" "${STAGING_API_BASE}/api/_health" || true)"
[[ "$code_health" == "200" ]] || fail "staging api health status=${code_health}"
if rg -q '"ok"\s*:\s*true' /tmp/staging-health.json; then
  pass "staging api health ok=true"
else
  fail "staging api health payload invalid"
fi

echo "STAGING HEALTH: PASS"
