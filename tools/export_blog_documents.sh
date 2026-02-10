#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_PATH="${OUTPUT_PATH:-$ROOT_DIR/artifacts/search/blog-documents.json}"
STRAPI_BASE_URL="${STRAPI_BASE_URL:-http://127.0.0.1:1337}"
PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-https://www.geovito.com}"

mkdir -p "$(dirname "$OUTPUT_PATH")"

docker run --rm \
  --network host \
  -v "$ROOT_DIR:/work" \
  -w /work \
  -e STRAPI_BASE_URL="$STRAPI_BASE_URL" \
  -e STRAPI_API_TOKEN="${STRAPI_API_TOKEN:-}" \
  -e PUBLIC_SITE_URL="$PUBLIC_SITE_URL" \
  -e OUTPUT_PATH="$OUTPUT_PATH" \
  node:20-alpine \
  node tools/export_blog_documents.js

echo "Export complete: $OUTPUT_PATH"
