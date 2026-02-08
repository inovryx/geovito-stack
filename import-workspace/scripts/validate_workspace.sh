#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "============================================"
echo "IMPORT WORKSPACE VALIDATION (NO EXECUTION)"
echo "============================================"

required=(
  "$ROOT_DIR/README.md"
  "$ROOT_DIR/RUNBOOK_IMPORT.md"
  "$ROOT_DIR/contracts/atlas-import.v1.schema.json"
  "$ROOT_DIR/contracts/safe-update-fields.v1.json"
  "$ROOT_DIR/contracts/idempotency-rules.v1.md"
  "$ROOT_DIR/profiles/TR.yml"
  "$ROOT_DIR/profiles/US.yml"
  "$ROOT_DIR/profiles/DE.yml"
)

missing=0
for file in "${required[@]}"; do
  if [[ -f "$file" ]]; then
    echo "OK: $file"
  else
    echo "MISSING: $file"
    missing=$((missing + 1))
  fi
done

echo ""
echo "Result:"
if [[ "$missing" -gt 0 ]]; then
  echo "FAIL: $missing required files missing."
  exit 1
fi

echo "PASS: workspace scaffold is complete."
echo "NOTE: real import execution is intentionally not available here."
