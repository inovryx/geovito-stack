#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-http://127.0.0.1:1337}"
FAIL_COUNT=0
WARN_COUNT=0

pass() {
  echo "PASS: $1"
}

warn() {
  echo "WARN: $1"
  WARN_COUNT=$((WARN_COUNT + 1))
}

fail() {
  echo "FAIL: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

read_runtime_env() {
  local key="$1"
  docker compose exec -T strapi sh -lc "printenv ${key} 2>/dev/null || true" | tr -d '\r' | tail -n 1
}

is_true() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]
}

to_int() {
  local raw="$1"
  local fallback="$2"
  if [[ "$raw" =~ ^-?[0-9]+$ ]]; then
    echo "$raw"
  else
    echo "$fallback"
  fi
}

wait_for_strapi() {
  local max_attempts=60
  local attempt=1
  while [[ "$attempt" -le "$max_attempts" ]]; do
    if curl -sS --max-time 5 -o /dev/null "${API_BASE}/admin"; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  return 1
}

echo "=============================================================="
echo "GEOVITO BLOG ENGAGEMENT POLICY CHECK"
echo "API_BASE=${API_BASE}"
echo "=============================================================="

docker compose up -d strapi >/dev/null
if ! wait_for_strapi; then
  fail "strapi readiness check failed (${API_BASE}/admin)"
fi

AUTO_APPROVE_AFTER="$(read_runtime_env BLOG_COMMENT_REGISTERED_AUTO_APPROVE_AFTER)"
GUEST_MAX_LINKS="$(read_runtime_env BLOG_COMMENT_GUEST_MAX_LINKS)"
GUEST_SPAM_LINKS="$(read_runtime_env BLOG_COMMENT_GUEST_SPAM_LINKS)"
LIKE_RATE_WINDOW_MS="$(read_runtime_env BLOG_LIKE_RATE_WINDOW_MS)"
LIKE_RATE_MAX="$(read_runtime_env BLOG_LIKE_RATE_MAX)"
TURNSTILE_ENABLED_VAL="$(read_runtime_env TURNSTILE_ENABLED)"
GUEST_TURNSTILE_REQUIRED_VAL="$(read_runtime_env BLOG_COMMENT_GUEST_TURNSTILE_REQUIRED)"
TURNSTILE_SECRET_KEY_VAL="$(read_runtime_env TURNSTILE_SECRET_KEY)"
COMMENT_IP_HASH_SALT_VAL="$(read_runtime_env BLOG_COMMENT_IP_HASH_SALT)"
LIKE_IP_HASH_SALT_VAL="$(read_runtime_env BLOG_LIKE_IP_HASH_SALT)"

AUTO_APPROVE_AFTER_INT="$(to_int "$AUTO_APPROVE_AFTER" 2)"
GUEST_MAX_LINKS_INT="$(to_int "$GUEST_MAX_LINKS" 1)"
GUEST_SPAM_LINKS_INT="$(to_int "$GUEST_SPAM_LINKS" 3)"
LIKE_RATE_WINDOW_MS_INT="$(to_int "$LIKE_RATE_WINDOW_MS" 60000)"
LIKE_RATE_MAX_INT="$(to_int "$LIKE_RATE_MAX" 60)"

echo "Runtime values:"
echo "  BLOG_COMMENT_REGISTERED_AUTO_APPROVE_AFTER=${AUTO_APPROVE_AFTER_INT}"
echo "  BLOG_COMMENT_GUEST_MAX_LINKS=${GUEST_MAX_LINKS_INT}"
echo "  BLOG_COMMENT_GUEST_SPAM_LINKS=${GUEST_SPAM_LINKS_INT}"
echo "  BLOG_LIKE_RATE_WINDOW_MS=${LIKE_RATE_WINDOW_MS_INT}"
echo "  BLOG_LIKE_RATE_MAX=${LIKE_RATE_MAX_INT}"
echo "  TURNSTILE_ENABLED=${TURNSTILE_ENABLED_VAL:-false}"
echo "  BLOG_COMMENT_GUEST_TURNSTILE_REQUIRED=${GUEST_TURNSTILE_REQUIRED_VAL:-false}"

if (( AUTO_APPROVE_AFTER_INT < 0 )); then
  fail "BLOG_COMMENT_REGISTERED_AUTO_APPROVE_AFTER must be >= 0"
else
  pass "registered auto-approve threshold is valid"
fi

if (( GUEST_MAX_LINKS_INT < 0 )); then
  fail "BLOG_COMMENT_GUEST_MAX_LINKS must be >= 0"
else
  pass "guest max links is valid"
fi

if (( GUEST_SPAM_LINKS_INT <= GUEST_MAX_LINKS_INT )); then
  fail "BLOG_COMMENT_GUEST_SPAM_LINKS must be > BLOG_COMMENT_GUEST_MAX_LINKS"
else
  pass "guest spam threshold is valid"
fi

if (( LIKE_RATE_WINDOW_MS_INT < 1000 )); then
  fail "BLOG_LIKE_RATE_WINDOW_MS should be >= 1000"
else
  pass "like rate window is valid"
fi

if (( LIKE_RATE_MAX_INT < 1 )); then
  fail "BLOG_LIKE_RATE_MAX should be >= 1"
else
  pass "like rate max is valid"
fi

if is_true "${TURNSTILE_ENABLED_VAL:-false}" && is_true "${GUEST_TURNSTILE_REQUIRED_VAL:-false}"; then
  if [[ -n "${TURNSTILE_SECRET_KEY_VAL}" ]]; then
    pass "guest turnstile enforcement is configured with secret key"
  else
    fail "TURNSTILE_SECRET_KEY is required when guest turnstile is enforced"
  fi
elif is_true "${GUEST_TURNSTILE_REQUIRED_VAL:-false}"; then
  warn "BLOG_COMMENT_GUEST_TURNSTILE_REQUIRED=true but TURNSTILE_ENABLED is not true"
else
  pass "guest turnstile requirement is disabled (expected default)"
fi

if [[ -z "${COMMENT_IP_HASH_SALT_VAL}" ]]; then
  warn "BLOG_COMMENT_IP_HASH_SALT is empty; fallback salt will be used"
else
  pass "comment IP hash salt is set"
fi

if [[ -z "${LIKE_IP_HASH_SALT_VAL}" ]]; then
  warn "BLOG_LIKE_IP_HASH_SALT is empty; fallback salt will be used"
else
  pass "like IP hash salt is set"
fi

LIKE_TOGGLE_TMP="$(mktemp)"
LIKE_TOGGLE_CODE="$(curl -sS --max-time 20 -o "$LIKE_TOGGLE_TMP" -w '%{http_code}' \
  -X POST "${API_BASE}/api/blog-likes/toggle" \
  -H 'Content-Type: application/json' \
  -d '{"post_id":"policy-smoke-post"}' || true)"
if [[ "$LIKE_TOGGLE_CODE" == "401" || "$LIKE_TOGGLE_CODE" == "403" ]]; then
  pass "unauthenticated like toggle blocked (${LIKE_TOGGLE_CODE})"
else
  fail "unauthenticated like toggle must be blocked (status=${LIKE_TOGGLE_CODE})"
fi
rm -f "$LIKE_TOGGLE_TMP"

COMMENT_INVALID_TMP="$(mktemp)"
COMMENT_INVALID_CODE="$(curl -sS --max-time 20 -o "$COMMENT_INVALID_TMP" -w '%{http_code}' \
  -X POST "${API_BASE}/api/blog-comments/submit" \
  -H 'Content-Type: application/json' \
  -d '{"post_id":"policy-smoke-post","body":"","email":"guest@example.com"}' || true)"
if [[ "$COMMENT_INVALID_CODE" == "400" ]]; then
  pass "comment payload validation is active (empty body blocked)"
else
  fail "comment payload validation expected 400 for empty body (got ${COMMENT_INVALID_CODE})"
fi
rm -f "$COMMENT_INVALID_TMP"

echo "=============================================================="
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "BLOG ENGAGEMENT POLICY CHECK: FAIL (${FAIL_COUNT} issue, ${WARN_COUNT} warning)"
  echo "=============================================================="
  exit 1
fi

echo "BLOG ENGAGEMENT POLICY CHECK: PASS (${WARN_COUNT} warning)"
echo "=============================================================="
