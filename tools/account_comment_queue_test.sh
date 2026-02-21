#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.49.1-jammy}"

echo "=============================================================="
echo "GEOVITO ACCOUNT COMMENT QUEUE TEST (DOCKER PLAYWRIGHT)"
echo "=============================================================="

if [[ "$(id -u)" -eq 0 ]]; then
  echo "FAIL: Bu script root olarak calistirilmamalidir."
  echo "Lutfen normal bir kullanici ile tekrar calistirin."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "FAIL: docker komutu bulunamadi."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "FAIL: docker compose kullanilabilir degil."
  exit 1
fi

fix_frontend_ownership_and_cache() {
  if [[ "${ACCOUNT_TEST_AUTO_FIX_OWNERSHIP:-true}" != "true" ]]; then
    return 0
  fi

  echo "INFO: Frontend ownership/cache duzeltiliyor (EACCES onleme)."
  docker run --rm \
    -e UID_HOST="$(id -u)" \
    -e GID_HOST="$(id -g)" \
    -v "$PWD":/work \
    alpine:3.20 \
    sh -lc 'chown -R "$UID_HOST:$GID_HOST" /work/frontend && rm -rf /work/frontend/node_modules/.vite /work/frontend/test-results /work/frontend/playwright-report'
}

fix_frontend_ownership_and_cache

if [[ "${SKIP_STRAPI:-0}" != "1" ]]; then
  echo "INFO: Strapi ayaga kaldiriliyor (SKIP_STRAPI=1 degil)."
  docker compose up -d strapi
else
  echo "INFO: SKIP_STRAPI=1 oldugu icin Strapi baslatma adimi atlandi."
fi

docker run --rm \
  --network=host \
  -u "$(id -u):$(id -g)" \
  -v "$PWD":/work \
  -w /work/frontend \
  "$PLAYWRIGHT_IMAGE" \
  bash -lc "corepack pnpm@9.15.4 install --frozen-lockfile && corepack pnpm@9.15.4 exec playwright test tests/account-comment-queue.spec.ts --project desktop --reporter=line"

echo "=============================================================="
echo "PASS: Account comment queue Playwright smoke basariyla tamamlandi."
echo "=============================================================="
