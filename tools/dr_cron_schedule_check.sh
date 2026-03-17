#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CRON_EXPECT_ROOT_DIR="${DR_CRON_EXPECT_ROOT_DIR:-$ROOT_DIR}"
OUTPUT_FILE="${DR_CRON_SCHEDULE_OUTPUT_FILE:-artifacts/dr/cron-schedule-last.json}"

BACKUP_SCHEDULE_REGEX="${DR_CRON_BACKUP_SCHEDULE_REGEX:-15[[:space:]]+1[[:space:]]+\*[[:space:]]+\*[[:space:]]+\*}"
RESTORE_SCHEDULE_REGEX="${DR_CRON_RESTORE_SCHEDULE_REGEX:-45[[:space:]]+1[[:space:]]+\*[[:space:]]+\*[[:space:]]+1}"
BACKUP_CMD_REGEX="${DR_CRON_BACKUP_CMD_REGEX:-bash[[:space:]]+tools/backup_run\.sh[[:space:]]+>>[[:space:]]+artifacts/dr/cron-backup\.log[[:space:]]+2>&1}"
RESTORE_CMD_REGEX="${DR_CRON_RESTORE_CMD_REGEX:-bash[[:space:]]+tools/dr_weekly_restore_cycle\.sh[[:space:]]+>>[[:space:]]+artifacts/dr/cron-restore\.log[[:space:]]+2>&1}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

CRON_CONTENT="$(crontab -l 2>/dev/null || true)"
[[ -n "$CRON_CONTENT" ]] || fail "crontab is empty or unavailable for current user"

non_comment_count="$(printf '%s\n' "$CRON_CONTENT" | rg -v '^\s*(#|$)' | wc -l | tr -d ' ')"
[[ "$non_comment_count" =~ ^[0-9]+$ ]] || non_comment_count=0
(( non_comment_count > 0 )) || fail "crontab has no active entries"

backup_pattern="${BACKUP_SCHEDULE_REGEX}[[:space:]]+cd[[:space:]]+${CRON_EXPECT_ROOT_DIR}[[:space:]]+&&[[:space:]]+${BACKUP_CMD_REGEX}"
restore_pattern="${RESTORE_SCHEDULE_REGEX}[[:space:]]+cd[[:space:]]+${CRON_EXPECT_ROOT_DIR}[[:space:]]+&&[[:space:]]+${RESTORE_CMD_REGEX}"

backup_line="$(printf '%s\n' "$CRON_CONTENT" | rg -n "$backup_pattern" | head -n 1 || true)"
[[ -n "$backup_line" ]] || fail "missing daily backup_run cron entry"
pass "daily backup_run cron present"

restore_line="$(printf '%s\n' "$CRON_CONTENT" | rg -n "$restore_pattern" | head -n 1 || true)"
[[ -n "$restore_line" ]] || fail "missing weekly restore cycle cron entry"
pass "weekly restore cycle cron present"

mkdir -p "$(dirname "$OUTPUT_FILE")"

report_json="$(
  if command -v node >/dev/null 2>&1; then
    node - "$CRON_EXPECT_ROOT_DIR" "$backup_line" "$restore_line" <<'NODE'
const [rootDir, backupLine, restoreLine] = process.argv.slice(2);
const payload = {
  measured_at: new Date().toISOString(),
  status: "pass",
  expected_root_dir: rootDir,
  entries: {
    backup_run_daily: backupLine,
    restore_cycle_weekly: restoreLine,
  },
};
process.stdout.write(JSON.stringify(payload));
NODE
  else
    docker run --rm -i -v "$PWD":/work -w /work node:20-alpine node - "$CRON_EXPECT_ROOT_DIR" "$backup_line" "$restore_line" <<'NODE'
const [rootDir, backupLine, restoreLine] = process.argv.slice(2);
const payload = {
  measured_at: new Date().toISOString(),
  status: "pass",
  expected_root_dir: rootDir,
  entries: {
    backup_run_daily: backupLine,
    restore_cycle_weekly: restoreLine,
  },
};
process.stdout.write(JSON.stringify(payload));
NODE
  fi
)"
printf '%s\n' "$report_json" > "$OUTPUT_FILE"

pass "report written -> ${OUTPUT_FILE}"
echo "DR CRON SCHEDULE: PASS"
