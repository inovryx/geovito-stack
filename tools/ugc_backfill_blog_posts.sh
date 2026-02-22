#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=============================================================="
echo "GEOVITO UGC BLOG BACKFILL"
echo "=============================================================="

docker compose up -d strapi >/dev/null
docker compose exec -T strapi node scripts/backfill_blog_post_ugc_fields.js

echo "=============================================================="
echo "UGC BLOG BACKFILL: PASS"
echo "=============================================================="
