#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-http://127.0.0.1:1337}"
REQUEST_ID="prod-health-$(date -u +%Y%m%dT%H%M%SZ)"

echo "=============================================================="
echo "GEOVITO PROD MODE: health checks"
echo "=============================================================="

docker compose ps

admin_status=""
for _ in $(seq 1 60); do
  admin_status="$(curl -s -o /dev/null -w '%{http_code}' "$API_BASE/admin" || true)"
  if [[ "$admin_status" == "200" ]]; then
    break
  fi
  sleep 2
done

if [[ "$admin_status" != "200" ]]; then
  echo "FAIL: /admin returned $admin_status after readiness wait"
  exit 1
fi
echo "OK: /admin -> 200"

suggestion_payload="$(cat <<JSON
{"suggestion_type":"data_error","title":"PROD_HEALTH_SMOKE","description":"prod health smoke","language":"en"}
JSON
)"

submit_status="$(
  curl -s -o /dev/null -w '%{http_code}' \
    -X POST "$API_BASE/api/atlas-suggestions/submit" \
    -H "x-request-id: ${REQUEST_ID}-suggestion" \
    -H 'Content-Type: application/json' \
    -d "$suggestion_payload"
)"

if [[ "$submit_status" != "201" ]]; then
  echo "FAIL: /api/atlas-suggestions/submit returned $submit_status"
  exit 1
fi
echo "OK: suggestion submit -> 201"

cleanup_smoke_suggestions() {
  docker compose exec -T strapi sh -lc "cd /opt/app && node - <<'NODE'
const { compileStrapi, createStrapi } = require('@strapi/strapi');

(async () => {
  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();

  try {
    const records = await strapi.entityService.findMany('api::atlas-suggestion.atlas-suggestion', {
      filters: { title: { \$eq: 'PROD_HEALTH_SMOKE' } },
      fields: ['id'],
      pagination: { page: 1, pageSize: 500 },
    });

    for (const record of records) {
      await strapi.entityService.delete('api::atlas-suggestion.atlas-suggestion', record.id);
    }
  } finally {
    await strapi.destroy();
  }
})();
NODE" >/dev/null 2>&1
}

if cleanup_smoke_suggestions; then
  echo "OK: cleaned PROD_HEALTH_SMOKE suggestion records"
else
  echo "WARN: could not cleanup PROD_HEALTH_SMOKE records automatically"
fi

for route in "/api/atlas-places" "/api/blog-posts" "/api/ui-pages" "/api/atlas-suggestions"; do
  write_status="$(
    curl -s -o /dev/null -w '%{http_code}' \
      -X POST "$API_BASE${route}" \
      -H "x-request-id: ${REQUEST_ID}-write-lock" \
      -H 'Content-Type: application/json' \
      -d '{}'
  )"

  if [[ "$write_status" == "200" || "$write_status" == "201" || "$write_status" == "204" ]]; then
    echo "FAIL: unexpected public write success on ${route} (status ${write_status})"
    exit 1
  fi
done
echo "OK: public write lock checks passed"

ai_diag_status="$(
  curl -s -o /dev/null -w '%{http_code}' \
    -X POST "$API_BASE/api/ai/diagnostics" \
    -H "x-request-id: ${REQUEST_ID}-ai-diag" \
    -H 'Content-Type: application/json' \
    -d '{"since":"2h"}'
)"
if [[ "$ai_diag_status" != "403" ]]; then
  echo "FAIL: /api/ai/diagnostics expected 403, got $ai_diag_status"
  exit 1
fi

ai_draft_status="$(
  curl -s -o /dev/null -w '%{http_code}' \
    -X POST "$API_BASE/api/ai/draft" \
    -H "x-request-id: ${REQUEST_ID}-ai-draft" \
    -H 'Content-Type: application/json' \
    -d '{"mode":"blog","language":"en","notes":"health"}'
)"
if [[ "$ai_draft_status" != "403" ]]; then
  echo "FAIL: /api/ai/draft expected 403, got $ai_draft_status"
  exit 1
fi
echo "OK: AI endpoints blocked by default (403)"

echo "All production health checks passed."
