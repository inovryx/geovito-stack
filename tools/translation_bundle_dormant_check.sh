#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=============================================================="
echo "GEOVITO TRANSLATION BUNDLE DORMANT CHECK"
echo "=============================================================="

set +e
OUTPUT="$(bash tools/import_translation_bundle.sh 2>&1)"
CODE=$?
set -e

echo "$OUTPUT"
echo "translation_bundle_import_exit_code=$CODE"

if [[ $CODE -ne 1 ]]; then
  echo "FAIL: translation bundle import must be locked by default (expected exit 1)."
  exit 1
fi

if ! printf '%s\n' "$OUTPUT" | rg -q '\[DORMANT\]'; then
  echo "FAIL: dormant marker not found in translation bundle import output"
  exit 1
fi

if ! rg -q '^TRANSLATION_BUNDLE_ENABLED=false' .env.example; then
  echo "FAIL: .env.example must declare TRANSLATION_BUNDLE_ENABLED=false"
  exit 1
fi

if ! rg -q '^TRANSLATION_BUNDLE_ENABLED=false' .env.prod.example; then
  echo "FAIL: .env.prod.example must declare TRANSLATION_BUNDLE_ENABLED=false"
  exit 1
fi

echo "PASS: translation bundle import remains locked by default"
