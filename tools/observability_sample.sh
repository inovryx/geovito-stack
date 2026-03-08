#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/tools/lib_log_contract.sh"
gv_log_contract_init "scripts"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SUMMARY_DIR="${OBS_SAMPLE_SUMMARY_DIR:-artifacts/observability}"
SUMMARY_FILE="${OBS_SAMPLE_SUMMARY_FILE:-${SUMMARY_DIR}/sample-${STAMP}.txt}"

OBS_SAMPLE_WITH_SEO="${OBS_SAMPLE_WITH_SEO:-false}"
OBS_SAMPLE_WITH_BASELINE="${OBS_SAMPLE_WITH_BASELINE:-false}"
OBS_SAMPLE_ALERT_ON_FAIL="${OBS_SAMPLE_ALERT_ON_FAIL:-false}"
OBS_SAMPLE_ALERT_ALLOW_PARTIAL="${OBS_SAMPLE_ALERT_ALLOW_PARTIAL:-true}"

declare -a STEP_NAMES=()
declare -a STEP_STATUS=()
declare -a STEP_CODES=()

mkdir -p "$SUMMARY_DIR"

run_step() {
  local label="$1"
  shift

  local started_at_ms
  started_at_ms="$(date +%s%3N 2>/dev/null || true)"
  if [[ ! "$started_at_ms" =~ ^[0-9]+$ ]]; then
    started_at_ms="$(( $(date +%s) * 1000 ))"
  fi

  set +e
  "$@"
  local code=$?
  set -e

  local ended_at_ms latency_ms
  ended_at_ms="$(date +%s%3N 2>/dev/null || true)"
  if [[ ! "$ended_at_ms" =~ ^[0-9]+$ ]]; then
    ended_at_ms="$(( $(date +%s) * 1000 ))"
  fi
  latency_ms="$((ended_at_ms - started_at_ms))"

  STEP_NAMES+=("$label")
  STEP_CODES+=("$code")

  if [[ $code -eq 0 ]]; then
    STEP_STATUS+=("PASS")
    echo "PASS | ${label} | exit=${code}"
    gv_log_contract_emit "release" "info" "Observability sample step passed" "observability_sample.step" 200 "$latency_ms" "step=${label};result=PASS"
  else
    STEP_STATUS+=("FAIL")
    echo "FAIL | ${label} | exit=${code}"
    gv_log_contract_emit "release" "error" "Observability sample step failed" "observability_sample.step" "$code" "$latency_ms" "step=${label};result=FAIL"
  fi
}

echo "=============================================================="
echo "GEOVITO OBSERVABILITY SAMPLE"
echo "with_seo=${OBS_SAMPLE_WITH_SEO}"
echo "with_baseline=${OBS_SAMPLE_WITH_BASELINE}"
echo "=============================================================="
gv_log_contract_emit "release" "info" "Observability sample started" "observability_sample.start" 0 0 "with_seo=${OBS_SAMPLE_WITH_SEO};with_baseline=${OBS_SAMPLE_WITH_BASELINE}"

run_step "Error Rate Check" bash tools/error_rate_check.sh
run_step "Storage Pressure Check" bash tools/storage_pressure_check.sh

if [[ "$OBS_SAMPLE_WITH_SEO" == "true" ]]; then
  run_step "SEO Drift Check" bash tools/seo_drift_check.sh
fi

if [[ "$OBS_SAMPLE_WITH_BASELINE" == "true" ]]; then
  run_step "Threshold Baseline Refresh" bash tools/observability_threshold_baseline.sh
fi

echo "================ OBSERVABILITY SAMPLE SUMMARY ================"
fail_count=0
for i in "${!STEP_NAMES[@]}"; do
  [[ "${STEP_STATUS[$i]}" == "FAIL" ]] && fail_count=$((fail_count + 1))
  printf '%s | %s | exit=%s\n' "${STEP_STATUS[$i]}" "${STEP_NAMES[$i]}" "${STEP_CODES[$i]}" | tee -a "$SUMMARY_FILE" >/dev/null
done
printf 'timestamp_utc=%s\n' "$STAMP" >> "$SUMMARY_FILE"
printf 'with_seo=%s\n' "$OBS_SAMPLE_WITH_SEO" >> "$SUMMARY_FILE"
printf 'with_baseline=%s\n' "$OBS_SAMPLE_WITH_BASELINE" >> "$SUMMARY_FILE"
echo "summary_file=${SUMMARY_FILE}"

if [[ "$fail_count" -gt 0 ]]; then
  gv_log_contract_emit "release" "error" "Observability sample failed" "observability_sample.summary" 1 0 "failed=${fail_count}"

  if [[ "$OBS_SAMPLE_ALERT_ON_FAIL" == "true" ]]; then
    ALERT_ALLOW_PARTIAL="$OBS_SAMPLE_ALERT_ALLOW_PARTIAL" \
    bash tools/alert_send.sh \
      "Geovito Observability Sample FAIL" \
      "Failed steps=${fail_count}. Summary=${SUMMARY_FILE}" || true
  fi

  echo "OBSERVABILITY SAMPLE: FAIL (${fail_count} failed)"
  exit 1
fi

gv_log_contract_emit "release" "info" "Observability sample passed" "observability_sample.summary" 0 0 "failed=0"
echo "OBSERVABILITY SAMPLE: PASS"
