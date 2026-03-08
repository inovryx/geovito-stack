#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/tools/lib_log_contract.sh"
gv_log_contract_init "scripts"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SUMMARY_DIR="${GO_LIVE_FULL_SUMMARY_DIR:-artifacts/go-live}"
SUMMARY_FILE="${GO_LIVE_FULL_SUMMARY_FILE:-${SUMMARY_DIR}/go-live-full-${STAMP}.txt}"

GO_LIVE_EMERGENCY_OVERRIDE="${GO_LIVE_EMERGENCY_OVERRIDE:-false}"
GO_LIVE_OVERRIDE_TICKET="${GO_LIVE_OVERRIDE_TICKET:-}"
GO_LIVE_OVERRIDE_APPROVER="${GO_LIVE_OVERRIDE_APPROVER:-}"
GO_LIVE_OVERRIDE_REASON="${GO_LIVE_OVERRIDE_REASON:-}"
GO_LIVE_OVERRIDE_ALLOWLIST="${GO_LIVE_OVERRIDE_ALLOWLIST:-}"
GO_LIVE_POLICY_TEST_MODE="${GO_LIVE_POLICY_TEST_MODE:-false}"
GO_LIVE_POLICY_TEST_FAILED_STEPS="${GO_LIVE_POLICY_TEST_FAILED_STEPS:-}"
GO_LIVE_WITH_OVERRIDE_POLICY_SMOKE="${GO_LIVE_WITH_OVERRIDE_POLICY_SMOKE:-true}"

CREATOR_USERNAME="${CREATOR_USERNAME:-}"
RESET_SMOKE_EMAIL="${RESET_SMOKE_EMAIL:-${EMAIL_SMOKE_TO:-}}"

declare -a STEP_NAMES=()
declare -a STEP_STATUS=()
declare -a STEP_CODES=()
declare -a OVERRIDE_POLICY_STEPS=(
  "Staging Isolation"
  "Restore Freshness"
  "Error Rate Check"
  "Storage Pressure Check"
)

mkdir -p "$SUMMARY_DIR"

trim_value() {
  echo "${1:-}" | xargs
}

array_contains_exact() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    if [[ "$item" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

join_array_csv() {
  local IFS=','
  echo "$*"
}

audit_override_event() {
  local failed_csv="$1"
  docker compose up -d strapi >/dev/null || true
  docker compose exec -T -e GO_LIVE_OVERRIDE_TICKET="$GO_LIVE_OVERRIDE_TICKET" -e GO_LIVE_OVERRIDE_APPROVER="$GO_LIVE_OVERRIDE_APPROVER" -e GO_LIVE_OVERRIDE_REASON="$GO_LIVE_OVERRIDE_REASON" -e GO_LIVE_OVERRIDE_FAILED_STEPS="$failed_csv" strapi node - <<'NODE' >/dev/null 2>&1 || true
const crypto = require('crypto');
const { compileStrapi, createStrapi } = require('@strapi/strapi');

(async () => {
  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();
  try {
    await strapi.entityService.create('api::audit-log.audit-log', {
      data: {
        event_id: `audit-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
        actor_user_id: null,
        actor_email: process.env.GO_LIVE_OVERRIDE_APPROVER || 'override@system.local',
        actor_role: 'system',
        action: 'gate.go_live_full.override',
        target_type: 'go-live-gate',
        target_ref: process.env.GO_LIVE_OVERRIDE_TICKET || 'unknown-ticket',
        payload: {
          reason: process.env.GO_LIVE_OVERRIDE_REASON || '',
          failed_steps: String(process.env.GO_LIVE_OVERRIDE_FAILED_STEPS || '').split(',').filter(Boolean),
        },
      },
    });
  } finally {
    await strapi.destroy();
  }
})();
NODE
}

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
    gv_log_contract_emit "release" "info" "Go-live full step passed" "go_live_gate_full.step" 200 "$latency_ms" "step=${label};result=PASS"
  else
    STEP_STATUS+=("FAIL")
    echo "FAIL | ${label} | exit=${code}"
    gv_log_contract_emit "release" "error" "Go-live full step failed" "go_live_gate_full.step" "$code" "$latency_ms" "step=${label};result=FAIL"
  fi
}

echo "=============================================================="
echo "GEOVITO GO-LIVE FULL GATE"
echo "creator_username=${CREATOR_USERNAME:-<empty>}"
echo "override=${GO_LIVE_EMERGENCY_OVERRIDE}"
echo "=============================================================="
gv_log_contract_emit "release" "info" "Go-live full gate started" "go_live_gate_full.start" 0 0 "override=${GO_LIVE_EMERGENCY_OVERRIDE};creator=${CREATOR_USERNAME}"
if [[ "$GO_LIVE_POLICY_TEST_MODE" == "true" ]]; then
  echo "INFO: GO_LIVE_POLICY_TEST_MODE=true (skipping runtime checks, simulating failed steps)."
  IFS=',' read -r -a failed_simulated_raw <<<"$GO_LIVE_POLICY_TEST_FAILED_STEPS"
  for item in "${failed_simulated_raw[@]}"; do
    item_trimmed="$(trim_value "$item")"
    if [[ -n "$item_trimmed" ]]; then
      STEP_NAMES+=("$item_trimmed")
      STEP_STATUS+=("FAIL")
      STEP_CODES+=("99")
    fi
  done
  if [[ ${#STEP_NAMES[@]} -eq 0 ]]; then
    STEP_NAMES+=("Policy Smoke Probe")
    STEP_STATUS+=("PASS")
    STEP_CODES+=("0")
  fi
else
  run_step "Core Go-Live Gate" bash -lc "cd '$ROOT_DIR' && GO_LIVE_WITH_BACKUP_VERIFY=true GO_LIVE_WITH_UGC_SHOWCASE_MOD=true GO_LIVE_REQUIRE_CREATOR=true GO_LIVE_WITH_SMTP=true GO_LIVE_WITH_LOG_CONTRACT_SMOKE=true GO_LIVE_SKIP_PRE_IMPORT=false GO_LIVE_SKIP_PRE_DESIGN=false GO_LIVE_SKIP_UI=false GO_LIVE_SKIP_REPORT_SMOKE=false GO_LIVE_SKIP_COMMUNITY_SETTINGS_SMOKE=false GO_LIVE_SKIP_UGC_API_CONTRACT=false GO_LIVE_SKIP_UI_PAGE_PROGRESS=false GO_LIVE_SKIP_DASHBOARD_ROLE_SMOKE=false GO_LIVE_SKIP_FOLLOW_SMOKE=false GO_LIVE_SKIP_NOTIFICATION_SMOKE=false GO_LIVE_SKIP_SAVED_LIST_SMOKE=false CREATOR_USERNAME='${CREATOR_USERNAME}' RESET_SMOKE_EMAIL='${RESET_SMOKE_EMAIL}' bash tools/go_live_gate.sh"
  run_step "Staging Isolation" bash tools/staging_isolation_check.sh
  run_step "Restore Freshness" bash tools/restore_freshness_check.sh
  run_step "Kill Switch Smoke" bash tools/kill_switch_smoke.sh
  run_step "Audit Log Smoke" bash tools/audit_log_smoke.sh
  run_step "SEO Drift Check" bash tools/seo_drift_check.sh
  run_step "Error Rate Check" bash tools/error_rate_check.sh
  run_step "Storage Pressure Check" bash tools/storage_pressure_check.sh
  if [[ "$GO_LIVE_WITH_OVERRIDE_POLICY_SMOKE" == "true" ]]; then
    run_step "Override Policy Smoke" bash tools/go_live_override_policy_smoke.sh
  fi
fi

echo "================ GO-LIVE FULL SUMMARY ================"
fail_count=0
for i in "${!STEP_NAMES[@]}"; do
  [[ "${STEP_STATUS[$i]}" == "FAIL" ]] && fail_count=$((fail_count + 1))
  printf '%s | %s | exit=%s\n' "${STEP_STATUS[$i]}" "${STEP_NAMES[$i]}" "${STEP_CODES[$i]}" | tee -a "$SUMMARY_FILE" >/dev/null
done
printf 'timestamp_utc=%s\n' "$STAMP" >> "$SUMMARY_FILE"
printf 'override=%s\n' "$GO_LIVE_EMERGENCY_OVERRIDE" >> "$SUMMARY_FILE"
printf 'creator_username=%s\n' "${CREATOR_USERNAME:-}" >> "$SUMMARY_FILE"
printf 'override_policy_allowlist=%s\n' "$(join_array_csv "${OVERRIDE_POLICY_STEPS[@]}")" >> "$SUMMARY_FILE"
echo "summary_file=${SUMMARY_FILE}"

if [[ "$fail_count" -eq 0 ]]; then
  gv_log_contract_emit "release" "info" "Go-live full gate passed" "go_live_gate_full.summary" 0 0 "failed=0;override=false"
  echo "GO-LIVE FULL GATE: PASS"
  exit 0
fi

failed_steps=()
for i in "${!STEP_NAMES[@]}"; do
  if [[ "${STEP_STATUS[$i]}" == "FAIL" ]]; then
    failed_steps+=("${STEP_NAMES[$i]}")
  fi
done

failed_csv="$(IFS=,; echo "${failed_steps[*]}")"

if [[ "$GO_LIVE_EMERGENCY_OVERRIDE" != "true" ]]; then
  gv_log_contract_emit "release" "error" "Go-live full gate failed" "go_live_gate_full.summary" 1 0 "failed=${fail_count};override=false"
  echo "GO-LIVE FULL GATE: FAIL (${fail_count} failed)"
  exit 1
fi

[[ -n "$GO_LIVE_OVERRIDE_TICKET" ]] || { echo "FAIL: GO_LIVE_OVERRIDE_TICKET is required"; exit 1; }
[[ -n "$GO_LIVE_OVERRIDE_APPROVER" ]] || { echo "FAIL: GO_LIVE_OVERRIDE_APPROVER is required"; exit 1; }
[[ -n "$GO_LIVE_OVERRIDE_REASON" ]] || { echo "FAIL: GO_LIVE_OVERRIDE_REASON is required"; exit 1; }
[[ -n "$GO_LIVE_OVERRIDE_ALLOWLIST" ]] || { echo "FAIL: GO_LIVE_OVERRIDE_ALLOWLIST is required"; exit 1; }

if ! [[ "$GO_LIVE_OVERRIDE_TICKET" =~ ^[A-Z][A-Z0-9_-]*-[0-9]+$ ]]; then
  echo "FAIL: GO_LIVE_OVERRIDE_TICKET must match pattern like INC-1234"
  exit 1
fi

if ! [[ "$GO_LIVE_OVERRIDE_APPROVER" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  echo "FAIL: GO_LIVE_OVERRIDE_APPROVER must be a valid email"
  exit 1
fi

if [[ ${#GO_LIVE_OVERRIDE_REASON} -lt 12 ]]; then
  echo "FAIL: GO_LIVE_OVERRIDE_REASON must be at least 12 characters"
  exit 1
fi

IFS=',' read -r -a allowed_raw <<<"$GO_LIVE_OVERRIDE_ALLOWLIST"
allowed=()
for item in "${allowed_raw[@]}"; do
  item_trimmed="$(trim_value "$item")"
  if [[ -n "$item_trimmed" ]]; then
    allowed+=("$item_trimmed")
  fi
done

if [[ ${#allowed[@]} -eq 0 ]]; then
  echo "FAIL: GO_LIVE_OVERRIDE_ALLOWLIST must contain at least one step name"
  exit 1
fi

for failed in "${failed_steps[@]}"; do
  if ! array_contains_exact "$failed" "${OVERRIDE_POLICY_STEPS[@]}"; then
    echo "FAIL: override policy forbids step: $failed"
    echo "Allowed by policy: $(join_array_csv "${OVERRIDE_POLICY_STEPS[@]}")"
    exit 1
  fi

  if ! array_contains_exact "$failed" "${allowed[@]}"; then
    echo "FAIL: override does not allow failed step: $failed"
    exit 1
  fi
done

audit_override_event "$failed_csv"
gv_log_contract_emit "audit" "warn" "Go-live full override applied" "gate.go_live_full.override" 200 0 "ticket=${GO_LIVE_OVERRIDE_TICKET};failed_steps=${failed_csv}"
echo "GO-LIVE FULL GATE: PASS_WITH_OVERRIDE"
echo "override_ticket=${GO_LIVE_OVERRIDE_TICKET}"
echo "failed_steps=${failed_csv}"
printf 'override_ticket=%s\n' "$GO_LIVE_OVERRIDE_TICKET" >> "$SUMMARY_FILE"
printf 'override_failed_steps=%s\n' "$failed_csv" >> "$SUMMARY_FILE"
