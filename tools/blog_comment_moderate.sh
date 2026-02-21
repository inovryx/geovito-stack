#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-http://127.0.0.1:1337}"
SCRIPT_IN_CONTAINER="scripts/blog_comment_moderate.js"

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

  if docker compose exec -T strapi sh -lc "test -f ${SCRIPT_IN_CONTAINER} && grep -q \"bulk-set-next\" ${SCRIPT_IN_CONTAINER} && grep -q -- \"--dry-run\" ${SCRIPT_IN_CONTAINER}" >/dev/null 2>&1; then
    return 0
  fi

  echo "INFO: Strapi container script guncel degil, rebuild yapiliyor..."
  docker compose up -d --build strapi >/dev/null
}

if [[ $# -eq 0 ]]; then
  cat <<'USAGE'
Usage:
  bash tools/blog_comment_moderate.sh list [--status pending] [--limit 20]
  bash tools/blog_comment_moderate.sh set <comment_id> <status> [--notes "text"]
  bash tools/blog_comment_moderate.sh next
  bash tools/blog_comment_moderate.sh set-next <status> [--notes "text"] [--dry-run]
  bash tools/blog_comment_moderate.sh bulk-set-next <status> [--limit 20] [--notes "text"] [--dry-run]
USAGE
  exit 1
fi

echo "=============================================================="
echo "GEOVITO BLOG COMMENT MODERATE"
echo "API_BASE=${API_BASE}"
echo "=============================================================="

ensure_strapi_runtime
if ! wait_for_strapi; then
  echo "FAIL: strapi readiness check failed (${API_BASE}/admin)"
  exit 1
fi

docker compose exec -T strapi node scripts/blog_comment_moderate.js "$@"
