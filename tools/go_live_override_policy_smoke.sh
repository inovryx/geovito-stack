#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  echo "PASS: $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  echo "FAIL: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

run_case() {
  local label="$1"
  local expected_exit="$2"
  local expected_pattern="$3"
  shift 3

  local tmp_file
  tmp_file="$(mktemp)"
  set +e
  "$@" >"$tmp_file" 2>&1
  local code=$?
  set -e

  if [[ "$code" -ne "$expected_exit" ]]; then
    fail "$label (exit expected=${expected_exit}, got=${code})"
    echo "---- output (${label}) ----"
    cat "$tmp_file"
    echo "---------------------------"
    rm -f "$tmp_file"
    return
  fi

  if ! rg -q "$expected_pattern" "$tmp_file"; then
    fail "$label (missing pattern: $expected_pattern)"
    echo "---- output (${label}) ----"
    cat "$tmp_file"
    echo "---------------------------"
    rm -f "$tmp_file"
    return
  fi

  pass "$label"
  rm -f "$tmp_file"
}

echo "=============================================================="
echo "GEOVITO GO-LIVE OVERRIDE POLICY SMOKE"
echo "=============================================================="

BASE_ENV=(
  "GO_LIVE_POLICY_TEST_MODE=true"
  "GO_LIVE_POLICY_TEST_FAILED_STEPS=Restore Freshness"
  "GO_LIVE_EMERGENCY_OVERRIDE=true"
  "GO_LIVE_OVERRIDE_ALLOWLIST=Restore Freshness"
  "GO_LIVE_OVERRIDE_APPROVER=ops@geovito.com"
  "GO_LIVE_OVERRIDE_REASON=infra provider incident"
  "GO_LIVE_WITH_BACKUP_VERIFY=false"
  "GO_LIVE_WITH_SMTP=false"
)

run_case \
  "reject invalid ticket format" \
  1 \
  "GO_LIVE_OVERRIDE_TICKET must match pattern" \
  env "${BASE_ENV[@]}" GO_LIVE_OVERRIDE_TICKET=bad bash tools/go_live_gate_full.sh

run_case \
  "reject invalid approver email" \
  1 \
  "GO_LIVE_OVERRIDE_APPROVER must be a valid email" \
  env "${BASE_ENV[@]}" GO_LIVE_OVERRIDE_TICKET=INC-1001 GO_LIVE_OVERRIDE_APPROVER=bad bash tools/go_live_gate_full.sh

run_case \
  "reject short override reason" \
  1 \
  "GO_LIVE_OVERRIDE_REASON must be at least 12 characters" \
  env "${BASE_ENV[@]}" GO_LIVE_OVERRIDE_TICKET=INC-1002 GO_LIVE_OVERRIDE_REASON=short bash tools/go_live_gate_full.sh

run_case \
  "reject policy-forbidden failed step" \
  1 \
  "override policy forbids step" \
  env "${BASE_ENV[@]}" GO_LIVE_OVERRIDE_TICKET=INC-1003 GO_LIVE_POLICY_TEST_FAILED_STEPS="Core Go-Live Gate" GO_LIVE_OVERRIDE_ALLOWLIST="Core Go-Live Gate" bash tools/go_live_gate_full.sh

run_case \
  "reject allowlist mismatch" \
  1 \
  "override does not allow failed step" \
  env "${BASE_ENV[@]}" GO_LIVE_OVERRIDE_TICKET=INC-1004 GO_LIVE_OVERRIDE_ALLOWLIST="Staging Isolation" bash tools/go_live_gate_full.sh

run_case \
  "accept valid override for allowed step" \
  0 \
  "GO-LIVE FULL GATE: PASS_WITH_OVERRIDE" \
  env "${BASE_ENV[@]}" GO_LIVE_OVERRIDE_TICKET=INC-1005 bash tools/go_live_gate_full.sh

echo "=============================================================="
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "OVERRIDE POLICY SMOKE: FAIL (${FAIL_COUNT} failed, ${PASS_COUNT} pass)"
  exit 1
fi
echo "OVERRIDE POLICY SMOKE: PASS (${PASS_COUNT} pass)"
echo "=============================================================="
