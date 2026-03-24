#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${FRONTEND_DIR:-$ROOT_DIR/frontend}"
NODE_IMAGE="${I18N_SEED_NODE_IMAGE:-node:20-alpine}"
TARGET_FILES_CSV="${I18N_SEED_TARGET_FILES:-src/pages/[lang]/dashboard/index.astro,src/pages/[lang]/account/index.astro}"

echo "=============================================================="
echo "GEOVITO I18N SEED FROM FALLBACKS"
echo "frontend_dir=${FRONTEND_DIR}"
echo "target_files=${TARGET_FILES_CSV}"
echo "=============================================================="

if [[ ! -d "$FRONTEND_DIR/src/i18n" ]]; then
  echo "FAIL: i18n directory missing -> $FRONTEND_DIR/src/i18n"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "FAIL: docker command is required"
  exit 1
fi

docker run --rm \
  -e FRONTEND_DIR_IN_CONTAINER=/repo/frontend \
  -e TARGET_FILES_CSV="$TARGET_FILES_CSV" \
  -v "$ROOT_DIR":/repo \
  -w /repo \
  "$NODE_IMAGE" \
  node tools/i18n_seed_from_fallbacks.mjs

echo "=============================================================="
echo "I18N SEED FROM FALLBACKS: PASS"
echo "Next: run i18n parity + source audit."
echo "=============================================================="
