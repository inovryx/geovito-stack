#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=============================================================="
echo "GEOVITO MOCK PURGE: removing all mock=true records"
echo "=============================================================="

docker compose exec -T strapi sh -lc "cd /opt/app && npm run mock:clear"

echo "Mock purge completed."
