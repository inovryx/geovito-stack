#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-http://127.0.0.1:1337}"
BLOG_AUTH_JWT="${BLOG_AUTH_JWT:-}"
TEST_EMAIL="${BLOG_ENGAGEMENT_SMOKE_EMAIL:-guest-smoke@example.com}"
FAIL_COUNT=0

pass() {
  echo "PASS: $1"
}

warn() {
  echo "WARN: $1"
}

fail() {
  echo "FAIL: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

extract_post_id() {
  local file="$1"
  grep -o '"post_id":"[^"]*"' "$file" | head -n1 | cut -d'"' -f4 || true
}

request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local auth_header="${4:-}"
  local response_file="$5"
  local code

  if [[ -n "$body" && -n "$auth_header" ]]; then
    code="$(curl -sS --max-time 20 -o "$response_file" -w '%{http_code}' -X "$method" "$url" -H 'Content-Type: application/json' -H "$auth_header" -d "$body" || true)"
  elif [[ -n "$body" ]]; then
    code="$(curl -sS --max-time 20 -o "$response_file" -w '%{http_code}' -X "$method" "$url" -H 'Content-Type: application/json' -d "$body" || true)"
  elif [[ -n "$auth_header" ]]; then
    code="$(curl -sS --max-time 20 -o "$response_file" -w '%{http_code}' -X "$method" "$url" -H "$auth_header" || true)"
  else
    code="$(curl -sS --max-time 20 -o "$response_file" -w '%{http_code}' -X "$method" "$url" || true)"
  fi

  echo "$code"
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
echo "GEOVITO BLOG ENGAGEMENT SMOKE"
echo "API_BASE=${API_BASE}"
echo "=============================================================="

docker compose up -d strapi >/dev/null
if ! wait_for_strapi; then
  fail "strapi readiness check failed (${API_BASE}/admin)"
  echo "=============================================================="
  echo "BLOG ENGAGEMENT SMOKE: FAIL (${FAIL_COUNT} issue)"
  echo "=============================================================="
  exit 1
fi

POST_TMP="$(mktemp)"
POSTS_CODE="$(curl --globoff -sS --max-time 20 -o "$POST_TMP" -w '%{http_code}' "${API_BASE}/api/blog-posts?pagination[pageSize]=1" || true)"

POST_ID=""
if [[ "$POSTS_CODE" == "200" ]]; then
  POST_ID="$(extract_post_id "$POST_TMP")"
fi
rm -f "$POST_TMP"

if [[ -z "$POST_ID" ]]; then
  warn "No blog post found; fallback checks will use synthetic post_id."
  POST_ID="post-smoke-missing"
fi

COUNT_COMMENTS_TMP="$(mktemp)"
COUNT_COMMENTS_CODE="$(request GET "${API_BASE}/api/blog-comments/count/${POST_ID}" "" "" "$COUNT_COMMENTS_TMP")"
if [[ "$COUNT_COMMENTS_CODE" == "200" ]]; then
  pass "comments count endpoint reachable (${POST_ID})"
else
  fail "comments count endpoint status=${COUNT_COMMENTS_CODE} body=$(cat "$COUNT_COMMENTS_TMP")"
fi
rm -f "$COUNT_COMMENTS_TMP"

COUNT_LIKES_TMP="$(mktemp)"
COUNT_LIKES_CODE="$(request GET "${API_BASE}/api/blog-likes/count/${POST_ID}" "" "" "$COUNT_LIKES_TMP")"
if [[ "$COUNT_LIKES_CODE" == "200" ]]; then
  pass "likes count endpoint reachable (${POST_ID})"
else
  fail "likes count endpoint status=${COUNT_LIKES_CODE} body=$(cat "$COUNT_LIKES_TMP")"
fi
rm -f "$COUNT_LIKES_TMP"

SUBMIT_TMP="$(mktemp)"
SUBMIT_BODY="$(cat <<EOF
{"post_id":"${POST_ID}","body":"Guest comment smoke","display_name":"Smoke Guest","email":"${TEST_EMAIL}","language":"en"}
EOF
)"
SUBMIT_CODE="$(request POST "${API_BASE}/api/blog-comments/submit" "$SUBMIT_BODY" "" "$SUBMIT_TMP")"

if [[ "$SUBMIT_CODE" == "201" ]]; then
  pass "guest comment submit accepted"
elif [[ "$SUBMIT_CODE" == "400" ]]; then
  warn "guest comment submit rejected with 400 (expected if post is synthetic): $(cat "$SUBMIT_TMP")"
elif [[ "$SUBMIT_CODE" == "403" ]]; then
  warn "guest comment submit blocked (Turnstile or guard enabled): $(cat "$SUBMIT_TMP")"
else
  fail "guest comment submit unexpected status=${SUBMIT_CODE} body=$(cat "$SUBMIT_TMP")"
fi
rm -f "$SUBMIT_TMP"

TOGGLE_TMP="$(mktemp)"
if [[ -n "$BLOG_AUTH_JWT" ]]; then
  TOGGLE_CODE="$(request POST "${API_BASE}/api/blog-likes/toggle" "{\"post_id\":\"${POST_ID}\"}" "Authorization: Bearer ${BLOG_AUTH_JWT}" "$TOGGLE_TMP")"
  if [[ "$TOGGLE_CODE" == "200" ]]; then
    pass "authenticated like toggle accepted"
  elif [[ "$TOGGLE_CODE" == "400" ]]; then
    warn "authenticated like toggle returned 400 (likely synthetic post_id): $(cat "$TOGGLE_TMP")"
  elif [[ "$TOGGLE_CODE" == "403" ]]; then
    warn "authenticated like toggle forbidden (check Authenticated role permissions): $(cat "$TOGGLE_TMP")"
  else
    fail "authenticated like toggle unexpected status=${TOGGLE_CODE} body=$(cat "$TOGGLE_TMP")"
  fi
else
  TOGGLE_CODE="$(request POST "${API_BASE}/api/blog-likes/toggle" "{\"post_id\":\"${POST_ID}\"}" "" "$TOGGLE_TMP")"
  if [[ "$TOGGLE_CODE" == "401" || "$TOGGLE_CODE" == "403" ]]; then
    pass "unauthenticated like toggle blocked (${TOGGLE_CODE})"
  else
    fail "unauthenticated like toggle should be blocked (status=${TOGGLE_CODE}) body=$(cat "$TOGGLE_TMP")"
  fi
fi
rm -f "$TOGGLE_TMP"

echo "=============================================================="
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "BLOG ENGAGEMENT SMOKE: FAIL (${FAIL_COUNT} issue)"
  echo "=============================================================="
  exit 1
fi
echo "BLOG ENGAGEMENT SMOKE: PASS"
echo "=============================================================="
