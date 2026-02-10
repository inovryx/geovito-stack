#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

INPUT_DIR="/opt/app/artifacts/translation-bundle/latest"
EXTRA_ARGS=()

if [[ -n "${1:-}" ]] && [[ "${1}" != "--dry-run" ]]; then
  INPUT_DIR="$1"
fi

if [[ "${1:-}" == "--dry-run" ]] || [[ "${2:-}" == "--dry-run" ]] || [[ "${TRANSLATION_BUNDLE_DRY_RUN:-false}" == "true" ]]; then
  EXTRA_ARGS+=("--dry-run")
fi

echo "=============================================================="
echo "GEOVITO TRANSLATION BUNDLE IMPORT"
echo "=============================================================="
echo "input_dir=${INPUT_DIR}"

docker compose up -d strapi >/dev/null
docker compose exec -T strapi node scripts/manage_translation_bundle.js import "$INPUT_DIR" "${EXTRA_ARGS[@]}"
