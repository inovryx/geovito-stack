#!/usr/bin/env bash
set -u -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FAIL_COUNT=0
SUMMARY_LINES=()

run_gate() {
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
    echo "RESULT: PASS (${name})"
    SUMMARY_LINES+=("PASS | ${name} | exit=0")
  else
    echo "RESULT: FAIL (${name}) exit=${code}"
    SUMMARY_LINES+=("FAIL | ${name} | exit=${code}")
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

echo "=============================================================="
echo "GEOVITO PRE-DESIGN GATE CHECK"
echo "=============================================================="

run_gate "Production Health" bash tools/prod_health.sh
run_gate "Import Dormant Guard" bash tools/import_dormant_check.sh
run_gate "Import Log Domain Sanity" bash tools/import_log_sanity_check.sh
run_gate "Pre-Import Index Gate" bash tools/pre_import_index_gate_check.sh
run_gate "Shell Smoke Test" bash tools/shell_smoke_test.sh
run_gate "Cloudflare Pages Build Check" bash tools/pages_build_check.sh
run_gate "Final Mock Purge Cleanup" bash tools/purge_mock.sh

echo ""
echo "================ PRE-DESIGN SUMMARY ================"
for line in "${SUMMARY_LINES[@]}"; do
  echo "$line"
done
echo "===================================================="

if [[ $FAIL_COUNT -gt 0 ]]; then
  echo "PRE-DESIGN GATE: FAIL (${FAIL_COUNT} failing gate)"
  exit 1
fi

echo "PRE-DESIGN GATE: PASS"
exit 0
