#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=============================================================="
echo "GEOVITO DASHBOARD ACTIVITY UI PLAYWRIGHT"
echo "=============================================================="

echo "PASS: ensuring strapi is running"
docker compose up -d strapi >/dev/null

echo "PASS: fixing frontend ownership/cache before playwright run"
docker run --rm -e UID_HOST="$(id -u)" -e GID_HOST="$(id -g)" -v "$PWD":/work alpine:3.20 \
  sh -lc 'chown -R "$UID_HOST:$GID_HOST" /work/frontend && rm -rf /work/frontend/node_modules/.vite /work/frontend/test-results /work/frontend/playwright-report'

echo "PASS: running dashboard activity playwright suite"
docker run --rm --network=host -u "$(id -u):$(id -g)" -v "$PWD":/work -w /work/frontend \
  mcr.microsoft.com/playwright:v1.49.1-jammy \
  bash -lc "corepack pnpm@9.15.4 install --frozen-lockfile && corepack pnpm@9.15.4 exec playwright test tests/dashboard-activity.spec.ts --project=desktop --reporter=line"

echo "=============================================================="
echo "DASHBOARD ACTIVITY UI PLAYWRIGHT: PASS"
echo "=============================================================="
