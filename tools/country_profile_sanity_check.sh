#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=============================================================="
echo "GEOVITO COUNTRY PROFILE SANITY CHECK"
echo "=============================================================="

docker compose exec -T strapi node scripts/country_profile_sanity_check.js
