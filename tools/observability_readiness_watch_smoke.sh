#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TMP_DIR="$(mktemp -d "artifacts/observability/readiness-watch-smoke.XXXXXX")"
REPORT_FILE="${TMP_DIR}/baseline-readiness-last.json"
STATE_FILE="${TMP_DIR}/readiness-watch-state.json"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

json_field_value() {
  local file="$1"
  local key="$2"
  local field
  field="$(rg -o "\"${key}\"\\s*:\\s*(true|false|null|\"[^\"]*\")" "$file" | head -n 1 || true)"
  [[ -n "$field" ]] || fail "missing key in json: ${key}"
  echo "$field" | sed -E "s/^\"${key}\"\\s*:\\s*//; s/^\"//; s/\"$//"
}

write_report() {
  local ready="$1"
  local observed_days="2"
  local deficit_days="5"
  if [[ "$ready" == "true" ]]; then
    observed_days="7"
    deficit_days="0"
  fi

  cat >"$REPORT_FILE" <<EOF
{
  "measured_at": "2026-03-09T00:00:00.000Z",
  "ready": ${ready},
  "observed": {
    "error_samples": 24,
    "storage_samples": 24,
    "error_distinct_days": ${observed_days},
    "storage_distinct_days": ${observed_days}
  },
  "deficits": {
    "error_samples": 0,
    "storage_samples": 0,
    "error_distinct_days": ${deficit_days},
    "storage_distinct_days": ${deficit_days}
  }
}
EOF
}

run_watch() {
  local label="$1"
  local output_file="${TMP_DIR}/${label}.log"
  set +e
  OBS_BASELINE_READINESS_OUTPUT_FILE="$REPORT_FILE" \
  OBS_READINESS_WATCH_STATE_FILE="$STATE_FILE" \
  OBS_READINESS_WATCH_SKIP_BASELINE_CHECK=true \
  OBS_READINESS_WATCH_ALERT_ON_READY=false \
  bash tools/observability_readiness_watch.sh >"$output_file" 2>&1
  local code=$?
  set -e

  if [[ $code -ne 0 ]]; then
    sed -n '1,120p' "$output_file" || true
    fail "${label} failed (exit=${code})"
  fi
  RUN_WATCH_LAST_LOG="$output_file"
}

echo "=============================================================="
echo "GEOVITO OBSERVABILITY READINESS WATCH SMOKE"
echo "tmp_dir=${TMP_DIR}"
echo "=============================================================="

write_report false
run_watch case1_not_ready
case1_log="$RUN_WATCH_LAST_LOG"
pass "case1_not_ready completed"
rg -q "OBSERVABILITY READINESS WATCH: NOT_READY" "$case1_log" || fail "case1 output missing NOT_READY marker"
[[ "$(json_field_value "$STATE_FILE" "ready")" == "false" ]] || fail "case1 expected ready=false"
[[ "$(json_field_value "$STATE_FILE" "transitioned_to_ready")" == "false" ]] || fail "case1 expected transitioned_to_ready=false"
pass "case1 assertions passed"

write_report true
run_watch case2_transition_ready
case2_log="$RUN_WATCH_LAST_LOG"
pass "case2_transition_ready completed"
rg -q "OBSERVABILITY READINESS WATCH: READY" "$case2_log" || fail "case2 output missing READY marker"
rg -q "readiness transitioned to READY" "$case2_log" || fail "case2 output missing transition warning"
[[ "$(json_field_value "$STATE_FILE" "ready")" == "true" ]] || fail "case2 expected ready=true"
[[ "$(json_field_value "$STATE_FILE" "previous_ready")" == "false" ]] || fail "case2 expected previous_ready=false"
[[ "$(json_field_value "$STATE_FILE" "transitioned_to_ready")" == "true" ]] || fail "case2 expected transitioned_to_ready=true"
first_ready_at_case2="$(json_field_value "$STATE_FILE" "first_ready_at")"
[[ -n "$first_ready_at_case2" && "$first_ready_at_case2" != "null" ]] || fail "case2 expected first_ready_at to be set"
pass "case2 assertions passed"

run_watch case3_steady_ready
case3_log="$RUN_WATCH_LAST_LOG"
pass "case3_steady_ready completed"
rg -q "OBSERVABILITY READINESS WATCH: READY" "$case3_log" || fail "case3 output missing READY marker"
[[ "$(json_field_value "$STATE_FILE" "ready")" == "true" ]] || fail "case3 expected ready=true"
[[ "$(json_field_value "$STATE_FILE" "previous_ready")" == "true" ]] || fail "case3 expected previous_ready=true"
[[ "$(json_field_value "$STATE_FILE" "transitioned_to_ready")" == "false" ]] || fail "case3 expected transitioned_to_ready=false"
first_ready_at_case3="$(json_field_value "$STATE_FILE" "first_ready_at")"
[[ "$first_ready_at_case3" == "$first_ready_at_case2" ]] || fail "case3 expected first_ready_at to stay stable"
pass "case3 assertions passed"

echo "=============================================================="
echo "OBSERVABILITY READINESS WATCH SMOKE: PASS"
echo "=============================================================="
