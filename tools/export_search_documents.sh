#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_PATH="${OUTPUT_PATH:-$ROOT_DIR/artifacts/search/atlas-documents.json}"
STRAPI_BASE_URL="${STRAPI_BASE_URL:-http://127.0.0.1:1337}"
PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-https://www.geovito.com}"

if [[ "$OUTPUT_PATH" = /* ]]; then
  if [[ "$OUTPUT_PATH" == "$ROOT_DIR/"* ]]; then
    CONTAINER_OUTPUT_PATH="/work/${OUTPUT_PATH#"$ROOT_DIR/"}"
  else
    echo "ERROR: OUTPUT_PATH must be under $ROOT_DIR when absolute."
    exit 1
  fi
else
  CONTAINER_OUTPUT_PATH="/work/$OUTPUT_PATH"
  OUTPUT_PATH="$ROOT_DIR/$OUTPUT_PATH"
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

docker run --rm \
  --network host \
  -v "$ROOT_DIR:/work" \
  -w /work \
  -e STRAPI_BASE_URL="$STRAPI_BASE_URL" \
  -e STRAPI_API_TOKEN="${STRAPI_API_TOKEN:-}" \
  -e PUBLIC_SITE_URL="$PUBLIC_SITE_URL" \
  -e OUTPUT_PATH="$CONTAINER_OUTPUT_PATH" \
  node:20-alpine \
  node tools/export_search_documents.js

echo "Export complete: $OUTPUT_PATH"
