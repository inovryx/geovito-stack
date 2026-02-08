#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=============================================================="
echo "GEOVITO PROD MODE: frontend smoke (i18n + build)"
echo "=============================================================="

docker compose run --rm frontend sh -lc "npm install && npm run i18n:check && npm run build"
