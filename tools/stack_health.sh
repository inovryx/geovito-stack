#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-http://127.0.0.1:1337}"
HEALTH_TOKEN="${HEALTH_TOKEN:-}"
FAIL_COUNT=0

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

extract_json_value() {
  local file="$1"
  local key="$2"
  tr -d '\n' < "$file" | sed -nE "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"?([^\",}]*)\"?.*/\\1/p"
}

check_service() {
  local service="$1"
  local cid
  cid="$(docker compose ps -q "$service" 2>/dev/null || true)"
  if [[ -z "$cid" ]]; then
    fail "docker service ${service} is not running"
    return
  fi

  local state
  state="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || true)"
  if [[ "$state" != "running" ]]; then
    fail "docker service ${service} state=${state:-unknown}"
    return
  fi

  local health
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || true)"
  if [[ "$health" == "healthy" || "$health" == "none" ]]; then
    pass "docker service ${service} running (health=${health})"
  else
    fail "docker service ${service} unhealthy (health=${health})"
  fi
}

echo "=============================================================="
echo "GEOVITO STACK HEALTH CHECK"
echo "API_BASE=${API_BASE}"
echo "=============================================================="

check_service "db"
check_service "strapi"

health_tmp="$(mktemp)"
health_headers=()
if [[ -n "$HEALTH_TOKEN" ]]; then
  health_headers+=(-H "x-health-token: ${HEALTH_TOKEN}")
fi

health_code="$(
  curl -sS --max-time 15 -o "$health_tmp" -w '%{http_code}' \
    "${health_headers[@]}" \
    "${API_BASE}/api/_health" || true
)"

if [[ "$health_code" != "200" ]]; then
  fail "strapi /api/_health status=${health_code}"
else
  ok_value="$(extract_json_value "$health_tmp" "ok")"
  db_value="$(extract_json_value "$health_tmp" "db")"
  if [[ "$ok_value" == "true" && "$db_value" == "true" ]]; then
    pass "strapi /api/_health ok=true db=true"
  else
    fail "strapi /api/_health unexpected body: $(cat "$health_tmp")"
  fi
fi

rm -f "$health_tmp"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "=============================================================="
  echo "STACK HEALTH: FAIL (${FAIL_COUNT} issue)"
  echo "=============================================================="
  exit 1
fi

echo "=============================================================="
echo "STACK HEALTH: PASS"
echo "=============================================================="
