#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="apply"
if [[ "${1:-}" == "--dry-run" ]]; then
  MODE="dry-run"
fi

echo "=============================================================="
echo "GEOVITO OAUTH PROVIDER APPLY"
echo "MODE=${MODE}"
echo "=============================================================="

wait_for_strapi_running() {
  local attempts="${1:-45}"
  local i=0
  while [[ "$i" -lt "$attempts" ]]; do
    if docker compose ps --status running --services | rg -qx 'strapi'; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

ensure_script_in_container() {
  docker compose exec -T strapi sh -lc 'test -f /opt/app/scripts/configure_oauth_providers.js'
}

if [[ "${REFRESH_STRAPI_ENV:-0}" == "1" ]]; then
  echo "INFO: REFRESH_STRAPI_ENV=1 => recreating strapi container to pick latest env."
  docker compose up -d --build --force-recreate strapi >/dev/null
else
  docker compose up -d strapi >/dev/null
fi

if ! wait_for_strapi_running 45; then
  echo "ERROR: strapi service did not reach running state."
  exit 1
fi

if ! ensure_script_in_container; then
  echo "INFO: oauth provider script not found in running container, rebuilding strapi image."
  docker compose up -d --build --force-recreate strapi >/dev/null
  if ! wait_for_strapi_running 45 || ! ensure_script_in_container; then
    echo "ERROR: /opt/app/scripts/configure_oauth_providers.js is still missing after rebuild."
    exit 1
  fi
fi

if [[ "$MODE" == "dry-run" ]]; then
  docker compose exec -T strapi node scripts/configure_oauth_providers.js --dry-run
else
  docker compose exec -T strapi node scripts/configure_oauth_providers.js
fi

echo "=============================================================="
echo "OAUTH PROVIDER APPLY: ${MODE^^} COMPLETE"
echo "=============================================================="
