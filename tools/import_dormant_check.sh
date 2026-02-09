#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=============================================================="
echo "GEOVITO IMPORT DORMANT CHECK"
echo "=============================================================="

set +e
OUTPUT="$(bash tools/run_import.sh 2>&1)"
CODE=$?
set -e

echo "$OUTPUT"
echo "run_import_exit_code=$CODE"

if [[ "$CODE" -ne 1 ]]; then
  echo "FAIL: run_import.sh expected exit code 1, got $CODE"
  exit 1
fi

if ! printf '%s\n' "$OUTPUT" | rg -q '\[DORMANT\]'; then
  echo "FAIL: dormant marker not found in run_import output"
  exit 1
fi

echo "PASS: import remains dormant (exit 1 + dormant marker)"
