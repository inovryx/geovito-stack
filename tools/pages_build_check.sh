#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=============================================================="
echo "GEOVITO PAGES BUILD CHECK"
echo "=============================================================="
echo "Cloudflare Pages monorepo settings:"
echo "- Root directory: frontend"
echo "- Build command: npm ci && npm run i18n:check && npm run build"
echo "- Output directory: dist"

docker compose run --rm frontend sh -lc "cd /opt/web && npm ci && npm run i18n:check && npm run build"

if [[ ! -d "$ROOT_DIR/frontend/dist" ]]; then
  echo "FAIL: frontend/dist not found after build"
  exit 1
fi

if [[ ! -f "$ROOT_DIR/frontend/dist/index.html" ]]; then
  echo "FAIL: frontend/dist/index.html not found after build"
  exit 1
fi

echo "PASS: Cloudflare Pages build artifacts present at frontend/dist"
