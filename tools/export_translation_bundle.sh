#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUTPUT_DIR="${1:-/opt/app/artifacts/translation-bundle/latest}"

echo "=============================================================="
echo "GEOVITO TRANSLATION BUNDLE EXPORT"
echo "=============================================================="
echo "output_dir=${OUTPUT_DIR}"

docker compose up -d strapi >/dev/null
docker compose exec -T strapi node scripts/manage_translation_bundle.js export "$OUTPUT_DIR"
