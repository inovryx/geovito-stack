#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$ROOT_DIR/tools/export_search_documents.sh"
bash "$ROOT_DIR/tools/export_blog_documents.sh"

docker run --rm \
  -v "$ROOT_DIR:/work" \
  -w /work \
  node:20-alpine \
  node tools/search_contract_check.js
