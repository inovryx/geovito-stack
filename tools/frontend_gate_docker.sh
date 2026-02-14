#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=============================================================="
echo "GEOVITO FRONTEND GATE CHAIN (DOCKER FRIENDLY)"
echo "=============================================================="

FAIL_COUNT=0
SUMMARY=()

run_step() {
  local name="$1"
  shift
  local cmd=("$@")

  echo ""
  echo ">>> ${name}"
  echo "CMD: ${cmd[*]}"

  set +e
  "${cmd[@]}"
  local code=$?
  set -e

  if [[ $code -eq 0 ]]; then
    SUMMARY+=("PASS | ${name} | exit=0")
    echo "RESULT: PASS (${name})"
  else
    SUMMARY+=("FAIL | ${name} | exit=${code}")
    echo "RESULT: FAIL (${name})"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

run_step "Frontend Prod Smoke" bash tools/prod_smoke_frontend.sh
run_step "Pre-Import Index Gate" bash tools/pre_import_index_gate_check.sh
run_step "Pre-Design Gate" bash tools/pre_design_gate_check.sh

echo ""
echo "================ FRONTEND GATE SUMMARY ================"
for line in "${SUMMARY[@]}"; do
  echo "$line"
done
echo "======================================================="

if [[ $FAIL_COUNT -gt 0 ]]; then
  echo "FRONTEND GATE CHAIN: FAIL (${FAIL_COUNT} failing step)"
  exit 1
fi

echo "FRONTEND GATE CHAIN: PASS"
echo "NOTE: pre_design_gate_check.sh runs purge_mock; re-seed mock data before local Playwright if needed."
