#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

INPUT_DIR="${1:-/opt/app/artifacts/translation-bundle/latest}"

echo "=============================================================="
echo "GEOVITO TRANSLATION BUNDLE IMPORT"
echo "=============================================================="
echo "input_dir=${INPUT_DIR}"

docker compose up -d strapi >/dev/null
docker compose exec -T strapi node scripts/manage_translation_bundle.js import "$INPUT_DIR"
