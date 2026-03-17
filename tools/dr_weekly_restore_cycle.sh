#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/tools/lib_log_contract.sh"
gv_log_contract_init "scripts"

BACKUP_STAMP="${BACKUP_STAMP:-latest}"
RESTORE_TARGET="${RESTORE_TARGET:-staging}"
WITH_ACCESS_SMOKE="${DR_WEEKLY_WITH_ACCESS_SMOKE:-false}"
RESTORE_SMOKE_BASE_URL="${DR_WEEKLY_RESTORE_SMOKE_BASE_URL:-${BASE_URL:-}}"
OUTPUT_FILE="${DR_WEEKLY_OUTPUT_FILE:-artifacts/dr/weekly-restore-cycle-last.json}"

pass() { echo "PASS: $1"; }
fail() {
  echo "FAIL: $1"
  gv_log_contract_emit "dr" "error" "Weekly restore cycle failed" "dr.weekly_restore_cycle.error" 1 0 "$1"
  exit 1
}

echo "=============================================================="
echo "GEOVITO DR WEEKLY RESTORE CYCLE"
echo "backup_stamp=${BACKUP_STAMP}"
echo "restore_target=${RESTORE_TARGET}"
echo "with_access_smoke=${WITH_ACCESS_SMOKE}"
echo "=============================================================="

gv_log_contract_emit "dr" "info" "Weekly restore cycle started" "dr.weekly_restore_cycle.start" 0 0 "stamp=${BACKUP_STAMP};target=${RESTORE_TARGET}"

bash tools/restore_run.sh "$BACKUP_STAMP"
pass "restore run completed"

BACKUP_STAMP="$BACKUP_STAMP" \
RESTORE_TARGET="$RESTORE_TARGET" \
RESTORE_SMOKE_WITH_ACCESS="$WITH_ACCESS_SMOKE" \
RESTORE_SMOKE_BASE_URL="$RESTORE_SMOKE_BASE_URL" \
bash tools/restore_smoke.sh
pass "restore smoke completed"

bash tools/restore_freshness_check.sh
pass "restore freshness check completed"

mkdir -p "$(dirname "$OUTPUT_FILE")"
cat > "$OUTPUT_FILE" <<JSON
{
  "status": "pass",
  "measured_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_stamp": "${BACKUP_STAMP}",
  "restore_target": "${RESTORE_TARGET}",
  "run_id": "${GV_LOG_REQUEST_ID}"
}
JSON
pass "report written -> ${OUTPUT_FILE}"

gv_log_contract_emit "dr" "info" "Weekly restore cycle passed" "dr.weekly_restore_cycle.complete" 0 0 "stamp=${BACKUP_STAMP};target=${RESTORE_TARGET}"
echo "DR WEEKLY RESTORE CYCLE: PASS"
