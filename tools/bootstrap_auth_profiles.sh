#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-http://127.0.0.1:1337}"
SCRIPT_IN_CONTAINER="scripts/bootstrap_auth_profiles.js"

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

ensure_strapi_runtime() {
  docker compose up -d strapi >/dev/null

  if docker compose exec -T strapi sh -lc "test -f ${SCRIPT_IN_CONTAINER}" >/dev/null 2>&1; then
    local host_hash=""
    local container_hash=""

    host_hash="$(sha256sum "${ROOT_DIR}/app/scripts/bootstrap_auth_profiles.js" | cut -d ' ' -f1)"
    container_hash="$(docker compose exec -T strapi sh -lc "sha256sum ${SCRIPT_IN_CONTAINER} | cut -d ' ' -f1" 2>/dev/null || true)"

    if [[ -n "$host_hash" && -n "$container_hash" && "$host_hash" == "$container_hash" ]]; then
      return 0
    fi

    echo "INFO: Strapi container bootstrap script guncel degil, rebuild yapiliyor..."
    docker compose up -d --build strapi >/dev/null
    return 0
  fi

  echo "INFO: Strapi container bootstrap script bulunamadi, rebuild yapiliyor..."
  docker compose up -d --build strapi >/dev/null
}

echo "=============================================================="
echo "GEOVITO AUTH PROFILE BOOTSTRAP"
echo "API_BASE=${API_BASE}"
echo "=============================================================="

ensure_strapi_runtime
if ! wait_for_strapi; then
  echo "FAIL: strapi readiness check failed (${API_BASE}/admin)"
  exit 1
fi

docker compose exec -T \
  -e SUPER_ADMIN_PRIMARY_EMAIL="${SUPER_ADMIN_PRIMARY_EMAIL:-}" \
  -e SUPER_ADMIN_PRIMARY_PASSWORD="${SUPER_ADMIN_PRIMARY_PASSWORD:-}" \
  -e SUPER_ADMIN_SECONDARY_EMAIL="${SUPER_ADMIN_SECONDARY_EMAIL:-}" \
  -e SUPER_ADMIN_SECONDARY_PASSWORD="${SUPER_ADMIN_SECONDARY_PASSWORD:-}" \
  -e ALT_ADMIN_EMAIL="${ALT_ADMIN_EMAIL:-}" \
  -e ALT_ADMIN_PASSWORD="${ALT_ADMIN_PASSWORD:-}" \
  -e ALT_ADMIN_FIRSTNAME="${ALT_ADMIN_FIRSTNAME:-}" \
  -e ALT_ADMIN_LASTNAME="${ALT_ADMIN_LASTNAME:-}" \
  -e ALT_ADMIN_ROLE_NAME="${ALT_ADMIN_ROLE_NAME:-}" \
  -e ALT_ADMIN_ROLE_CODE="${ALT_ADMIN_ROLE_CODE:-}" \
  -e ALT_ADMIN_ROLE_DESCRIPTION="${ALT_ADMIN_ROLE_DESCRIPTION:-}" \
  -e MEMBER_USER_EMAIL="${MEMBER_USER_EMAIL:-}" \
  -e MEMBER_USER_USERNAME="${MEMBER_USER_USERNAME:-}" \
  -e MEMBER_USER_PASSWORD="${MEMBER_USER_PASSWORD:-}" \
  strapi node "${SCRIPT_IN_CONTAINER}"

echo "=============================================================="
echo "PASS: auth profile bootstrap completed"
echo "=============================================================="
