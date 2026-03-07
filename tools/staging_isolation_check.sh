#!/usr/bin/env bash
set -euo pipefail

INPUT_STAGING_BASE_URL="${STAGING_BASE_URL-}"
INPUT_STAGING_API_BASE="${STAGING_API_BASE-}"
INPUT_STAGING_SMTP_MODE="${STAGING_SMTP_MODE-}"
INPUT_STAGING_SMTP_BLOCK_REAL="${STAGING_SMTP_BLOCK_REAL-}"
INPUT_STAGING_CF_ACCESS_CLIENT_ID="${STAGING_CF_ACCESS_CLIENT_ID-}"
INPUT_STAGING_CF_ACCESS_CLIENT_SECRET="${STAGING_CF_ACCESS_CLIENT_SECRET-}"

STAGING_ENV_FILE="${STAGING_ENV_FILE:-$HOME/.config/geovito/staging.env}"
if [[ -f "$STAGING_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$STAGING_ENV_FILE"
fi

[[ -n "$INPUT_STAGING_BASE_URL" ]] && STAGING_BASE_URL="$INPUT_STAGING_BASE_URL"
[[ -n "$INPUT_STAGING_API_BASE" ]] && STAGING_API_BASE="$INPUT_STAGING_API_BASE"
[[ -n "$INPUT_STAGING_SMTP_MODE" ]] && STAGING_SMTP_MODE="$INPUT_STAGING_SMTP_MODE"
[[ -n "$INPUT_STAGING_SMTP_BLOCK_REAL" ]] && STAGING_SMTP_BLOCK_REAL="$INPUT_STAGING_SMTP_BLOCK_REAL"
[[ -n "$INPUT_STAGING_CF_ACCESS_CLIENT_ID" ]] && STAGING_CF_ACCESS_CLIENT_ID="$INPUT_STAGING_CF_ACCESS_CLIENT_ID"
[[ -n "$INPUT_STAGING_CF_ACCESS_CLIENT_SECRET" ]] && STAGING_CF_ACCESS_CLIENT_SECRET="$INPUT_STAGING_CF_ACCESS_CLIENT_SECRET"

STAGING_BASE_URL="${STAGING_BASE_URL:-}"
STAGING_API_BASE="${STAGING_API_BASE:-}"
STAGING_SMTP_MODE="${STAGING_SMTP_MODE:-mailsink}"
STAGING_SMTP_BLOCK_REAL="${STAGING_SMTP_BLOCK_REAL:-true}"
STAGING_CF_ACCESS_CLIENT_ID="${STAGING_CF_ACCESS_CLIENT_ID:-}"
STAGING_CF_ACCESS_CLIENT_SECRET="${STAGING_CF_ACCESS_CLIENT_SECRET:-}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }
extract_host() {
  local url="$1"
  local host="${url#*://}"
  host="${host%%/*}"
  host="${host%%:*}"
  printf '%s' "$host"
}
ensure_dns() {
  local label="$1"
  local url="$2"
  local host
  host="$(extract_host "$url")"
  [[ -n "$host" ]] || fail "${label} host parse failed (${url})"
  if getent hosts "$host" >/dev/null 2>&1; then
    pass "${label} dns resolves (${host})"
    return 0
  fi
  fail "${label} dns does not resolve (${host}); create DNS record first"
}

[[ -n "$STAGING_BASE_URL" ]] || fail "STAGING_BASE_URL is required"
[[ -n "$STAGING_API_BASE" ]] || fail "STAGING_API_BASE is required"
if [[ "$STAGING_BASE_URL" == "https://geovito.com" || "$STAGING_BASE_URL" == "http://geovito.com" || "$STAGING_BASE_URL" == "https://www.geovito.com" || "$STAGING_BASE_URL" == "http://www.geovito.com" ]]; then
  fail "staging base points to production domain"
fi
if [[ "$STAGING_BASE_URL" != *"staging."* ]]; then
  fail "staging base must include a staging subdomain"
fi

if [[ "$STAGING_SMTP_MODE" == "mailsink" ]]; then
  pass "staging smtp mode is mailsink"
else
  fail "STAGING_SMTP_MODE must be mailsink"
fi

if [[ "$STAGING_SMTP_BLOCK_REAL" == "true" || "$STAGING_SMTP_BLOCK_REAL" == "1" ]]; then
  pass "staging real-email blocking enabled"
else
  fail "STAGING_SMTP_BLOCK_REAL must be true"
fi

ensure_dns "staging base" "$STAGING_BASE_URL"
ensure_dns "staging api" "$STAGING_API_BASE"

hdrs=()
if [[ -n "$STAGING_CF_ACCESS_CLIENT_ID" && -n "$STAGING_CF_ACCESS_CLIENT_SECRET" ]]; then
  hdrs+=( -H "CF-Access-Client-Id: ${STAGING_CF_ACCESS_CLIENT_ID}" )
  hdrs+=( -H "CF-Access-Client-Secret: ${STAGING_CF_ACCESS_CLIENT_SECRET}" )
fi

body_file="$(mktemp)"
code="$(curl -sS -o "$body_file" -w '%{http_code}' "${hdrs[@]}" "${STAGING_BASE_URL}/en/" || true)"
[[ "$code" == "200" ]] || fail "staging home status=${code}"

if rg -q 'meta name="robots" content="noindex,nofollow"' "$body_file"; then
  pass "staging robots noindex,nofollow"
else
  fail "staging robots meta missing or indexable"
fi

robots_code="$(curl -sS -o /tmp/staging-robots.txt -w '%{http_code}' "${hdrs[@]}" "${STAGING_BASE_URL}/robots.txt" || true)"
[[ "$robots_code" == "200" ]] || fail "staging robots.txt status=${robots_code}"
if rg -qi 'Disallow:\s*/' /tmp/staging-robots.txt; then
  pass "staging robots.txt disallow all"
else
  fail "staging robots.txt must disallow all"
fi

rm -f "$body_file"
echo "STAGING ISOLATION: PASS"
