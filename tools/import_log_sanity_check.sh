#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SINCE="${1:-2h}"

echo "=============================================================="
echo "GEOVITO IMPORT LOG SANITY CHECK"
echo "=============================================================="
echo "since=${SINCE}"

REPORT="$(bash tools/log_report.sh --since "$SINCE" --domain import)"
echo "$REPORT"

if ! printf '%s\n' "$REPORT" | rg -q '\[import\] total=0'; then
  echo "FAIL: import domain contains events in normal operations"
  exit 1
fi

echo "PASS: import domain remains reserved (total=0)"
