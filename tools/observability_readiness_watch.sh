#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/tools/lib_log_contract.sh"
gv_log_contract_init "scripts"

REPORT_FILE="${OBS_BASELINE_READINESS_OUTPUT_FILE:-artifacts/observability/baseline-readiness-last.json}"
STATE_FILE="${OBS_READINESS_WATCH_STATE_FILE:-artifacts/observability/readiness-watch-state.json}"
ALERT_ON_READY="${OBS_READINESS_WATCH_ALERT_ON_READY:-true}"
ALERT_ALLOW_PARTIAL="${OBS_READINESS_WATCH_ALERT_ALLOW_PARTIAL:-true}"
STRICT_CMD="${OBS_READINESS_WATCH_STRICT_CMD:-GO_LIVE_BASELINE_READINESS_STRICT=true GO_LIVE_WITH_BACKUP_VERIFY=true GO_LIVE_WITH_SMTP=true RESET_SMOKE_EMAIL=geovitoworld@gmail.com bash tools/go_live_gate_full.sh}"

pass() { echo "PASS: $1"; }
warn() { echo "WARN: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

if command -v node >/dev/null 2>&1; then
  js_runner=(node -)
else
  command -v docker >/dev/null 2>&1 || fail "node or docker is required"
  js_runner=(docker run --rm -i -v "$PWD":/work -w /work node:20-alpine node -)
fi

echo "=============================================================="
echo "GEOVITO OBSERVABILITY READINESS WATCH"
echo "report_file=${REPORT_FILE}"
echo "state_file=${STATE_FILE}"
echo "alert_on_ready=${ALERT_ON_READY}"
echo "=============================================================="
gv_log_contract_emit "release" "info" "Readiness watch started" "observability_readiness_watch.start" 0 0 "state_file=${STATE_FILE}"

set +e
bash tools/observability_baseline_readiness.sh
readiness_code=$?
set -e

if [[ $readiness_code -ne 0 ]]; then
  gv_log_contract_emit "release" "error" "Readiness watch baseline check failed" "observability_readiness_watch.baseline" "$readiness_code" 0 "report_file=${REPORT_FILE}"
  fail "baseline readiness check failed (exit=${readiness_code})"
fi

[[ -f "$REPORT_FILE" ]] || fail "missing readiness report: $REPORT_FILE"

calc_output="$(
  "${js_runner[@]}" "$REPORT_FILE" "$STATE_FILE" <<'NODE'
const fs = require('fs');
const path = require('path');

const [reportFile, stateFile] = process.argv.slice(2);

function safeReadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const report = safeReadJson(reportFile) || {};
const previous = safeReadJson(stateFile) || {};

const ready = report.ready === true;
const previousReady = typeof previous.ready === 'boolean' ? previous.ready : null;
const transitioned = ready && previousReady !== true;
const checkedAt = new Date().toISOString();

const observed = report.observed || {};
const deficits = report.deficits || {};
const observedSummary = `error_samples=${observed.error_samples ?? "?"},storage_samples=${observed.storage_samples ?? "?"},error_days=${observed.error_distinct_days ?? "?"},storage_days=${observed.storage_distinct_days ?? "?"}`;
const deficitSummary = `error_samples=${deficits.error_samples ?? "?"},storage_samples=${deficits.storage_samples ?? "?"},error_days=${deficits.error_distinct_days ?? "?"},storage_days=${deficits.storage_distinct_days ?? "?"}`;

const state = {
  checked_at: checkedAt,
  ready,
  previous_ready: previousReady,
  transitioned_to_ready: transitioned,
  report_measured_at: report.measured_at || null,
  observed,
  deficits,
  first_ready_at: previous.first_ready_at || (ready ? checkedAt : null),
};

fs.mkdirSync(path.dirname(stateFile), { recursive: true });
fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);

process.stdout.write(`READY=${ready}\n`);
process.stdout.write(`PREVIOUS_READY=${previousReady === null ? "unknown" : String(previousReady)}\n`);
process.stdout.write(`TRANSITIONED=${transitioned}\n`);
process.stdout.write(`OBSERVED_SUMMARY=${observedSummary}\n`);
process.stdout.write(`DEFICIT_SUMMARY=${deficitSummary}\n`);
process.stdout.write(`REPORT_TS=${report.measured_at || "unknown"}\n`);
process.stdout.write(`FIRST_READY_AT=${state.first_ready_at || "none"}\n`);
NODE
)"

ready="$(printf '%s\n' "$calc_output" | sed -n 's/^READY=//p' | tail -n 1)"
previous_ready="$(printf '%s\n' "$calc_output" | sed -n 's/^PREVIOUS_READY=//p' | tail -n 1)"
transitioned="$(printf '%s\n' "$calc_output" | sed -n 's/^TRANSITIONED=//p' | tail -n 1)"
observed_summary="$(printf '%s\n' "$calc_output" | sed -n 's/^OBSERVED_SUMMARY=//p' | tail -n 1)"
deficit_summary="$(printf '%s\n' "$calc_output" | sed -n 's/^DEFICIT_SUMMARY=//p' | tail -n 1)"
report_ts="$(printf '%s\n' "$calc_output" | sed -n 's/^REPORT_TS=//p' | tail -n 1)"
first_ready_at="$(printf '%s\n' "$calc_output" | sed -n 's/^FIRST_READY_AT=//p' | tail -n 1)"

pass "state snapshot updated -> ${STATE_FILE}"

if [[ "$ready" == "true" ]]; then
  pass "baseline readiness is READY (${observed_summary})"
  gv_log_contract_emit "release" "info" "Readiness watch: ready" "observability_readiness_watch.state" 0 0 "ready=true;observed=${observed_summary};previous=${previous_ready}"

  if [[ "$transitioned" == "true" ]]; then
    warn "readiness transitioned to READY (first_ready_at=${first_ready_at})"
    gv_log_contract_emit "release" "warn" "Readiness transitioned to ready" "observability_readiness_watch.transition" 0 0 "first_ready_at=${first_ready_at}"

    if [[ "$ALERT_ON_READY" == "true" ]]; then
      if [[ -n "${ALERT_TELEGRAM_BOT_TOKEN:-}" || -n "${ALERT_EMAIL_TO:-}" ]]; then
        set +e
        ALERT_ALLOW_PARTIAL="$ALERT_ALLOW_PARTIAL" \
          bash tools/alert_send.sh \
            "Geovito Baseline Readiness READY" \
            "Baseline readiness is ready (observed: ${observed_summary}). Strict promotion check command: ${STRICT_CMD}" \
            >/tmp/geovito-readiness-alert.log 2>&1
        alert_code=$?
        set -e
        if [[ $alert_code -eq 0 ]]; then
          pass "ready-transition alert sent"
        else
          warn "ready-transition alert failed (exit=${alert_code})"
          sed -n '1,40p' /tmp/geovito-readiness-alert.log || true
        fi
      else
        warn "alert channels not configured; skipping ready-transition alert"
      fi
    fi
  fi

  echo "OBSERVABILITY READINESS WATCH: READY"
  exit 0
fi

warn "baseline readiness still NOT_READY (deficits: ${deficit_summary})"
gv_log_contract_emit "release" "warn" "Readiness watch: not ready" "observability_readiness_watch.state" 0 0 "ready=false;deficits=${deficit_summary};report_ts=${report_ts}"
echo "OBSERVABILITY READINESS WATCH: NOT_READY"
exit 0
