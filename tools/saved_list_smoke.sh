#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-http://127.0.0.1:1337}"
SCRIPT_IN_CONTAINER="scripts/saved_list_smoke.js"

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

    host_hash="$(sha256sum "${ROOT_DIR}/app/scripts/saved_list_smoke.js" | cut -d ' ' -f1)"
    container_hash="$(docker compose exec -T strapi sh -lc "sha256sum ${SCRIPT_IN_CONTAINER} | cut -d ' ' -f1" 2>/dev/null || true)"

    if [[ -n "$host_hash" && -n "$container_hash" && "$host_hash" == "$container_hash" ]]; then
      return 0
    fi

    echo "INFO: Strapi container saved-list smoke script guncel degil, rebuild yapiliyor..."
    docker compose up -d --build strapi >/dev/null
    return 0
  fi

  echo "INFO: Strapi container saved-list smoke script bulunamadi, rebuild yapiliyor..."
  docker compose up -d --build strapi >/dev/null
}

echo "=============================================================="
echo "GEOVITO SAVED LIST SMOKE"
echo "API_BASE=${API_BASE}"
echo "=============================================================="

ensure_strapi_runtime
if ! wait_for_strapi; then
  echo "FAIL: strapi readiness check failed (${API_BASE}/admin)"
  exit 1
fi

docker compose exec -T -e API_BASE="${API_BASE}" strapi node "${SCRIPT_IN_CONTAINER}"
