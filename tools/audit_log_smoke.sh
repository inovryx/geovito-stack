#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-http://127.0.0.1:1337}"
SCRIPT_IN_CONTAINER="scripts/audit_log_smoke.js"
AUDIT_SMOKE_PREPARE="${AUDIT_SMOKE_PREPARE:-true}"
AUDIT_REQUIRED_ACTIONS="${AUDIT_REQUIRED_ACTIONS:-community.settings.update,moderation.content_report.set}"

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
  local host_hash container_hash
  host_hash="$(sha256sum "${ROOT_DIR}/app/scripts/audit_log_smoke.js" | cut -d ' ' -f1)"
  container_hash="$(docker compose exec -T strapi sh -lc "sha256sum ${SCRIPT_IN_CONTAINER} | cut -d ' ' -f1" 2>/dev/null || true)"

  if [[ -n "$host_hash" && -n "$container_hash" && "$host_hash" == "$container_hash" ]]; then
    return 0
  fi

  echo "INFO: Strapi container audit smoke script guncel degil, rebuild yapiliyor..."
  docker compose up -d --build strapi >/dev/null
}

if [[ "$AUDIT_SMOKE_PREPARE" == "true" ]]; then
  API_BASE="$API_BASE" bash tools/community_settings_smoke.sh >/dev/null
  API_BASE="$API_BASE" bash tools/report_moderation_smoke.sh >/dev/null
fi

echo "=============================================================="
echo "GEOVITO AUDIT LOG SMOKE"
echo "API_BASE=${API_BASE}"
echo "required_actions=${AUDIT_REQUIRED_ACTIONS}"
echo "=============================================================="

ensure_strapi_runtime
if ! wait_for_strapi; then
  echo "FAIL: strapi readiness check failed (${API_BASE}/admin)"
  exit 1
fi

docker compose exec -T -e API_BASE="${API_BASE}" -e AUDIT_REQUIRED_ACTIONS="${AUDIT_REQUIRED_ACTIONS}" strapi node "${SCRIPT_IN_CONTAINER}"
