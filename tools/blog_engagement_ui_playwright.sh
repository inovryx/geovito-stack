#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=============================================================="
echo "GEOVITO BLOG ENGAGEMENT UI PLAYWRIGHT"
echo "=============================================================="

echo "PASS: ensuring strapi is running"
docker compose up -d strapi >/dev/null

BLOG_CHECK_TMP="$(mktemp)"
trap 'rm -f "$BLOG_CHECK_TMP"' EXIT

BLOG_CODE="$(curl --globoff -sS --max-time 20 -o "$BLOG_CHECK_TMP" -w '%{http_code}' \
  "http://127.0.0.1:1337/api/blog-posts?pagination[pageSize]=1" || true)"

if [[ "$BLOG_CODE" != "200" ]]; then
  echo "WARN: blog post probe returned status=${BLOG_CODE}; seeding mock data to ensure detail routes."
  ALLOW_MOCK_SEED=true bash tools/mock_data.sh seed
elif ! grep -q '"post_id"' "$BLOG_CHECK_TMP"; then
  echo "INFO: no blog post found; seeding deterministic mock dataset."
  ALLOW_MOCK_SEED=true bash tools/mock_data.sh seed
else
  echo "PASS: blog post dataset already present"
fi

echo "PASS: fixing frontend ownership/cache before playwright run"
docker run --rm -e UID_HOST="$(id -u)" -e GID_HOST="$(id -g)" -v "$PWD":/work alpine:3.20 \
  sh -lc 'chown -R "$UID_HOST:$GID_HOST" /work/frontend && rm -rf /work/frontend/node_modules/.vite /work/frontend/test-results /work/frontend/playwright-report'

echo "PASS: running blog engagement UI playwright suite"
docker run --rm --network=host -u "$(id -u):$(id -g)" -v "$PWD":/work -w /work/frontend \
  mcr.microsoft.com/playwright:v1.49.1-jammy \
  bash -lc "corepack pnpm@9.15.4 install --frozen-lockfile && corepack pnpm@9.15.4 exec playwright test tests/blog-engagement-ui.spec.ts --project=desktop --reporter=line"

echo "=============================================================="
echo "BLOG ENGAGEMENT UI PLAYWRIGHT: PASS"
echo "=============================================================="
