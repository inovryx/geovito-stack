#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CRON_EXPECT_ROOT_DIR="${OBS_CRON_EXPECT_ROOT_DIR:-$ROOT_DIR}"
OUTPUT_FILE="${OBS_CRON_SCHEDULE_OUTPUT_FILE:-artifacts/observability/cron-schedule-last.json}"

SCHEDULE_DAILY_REGEX="${OBS_CRON_SCHEDULE_DAILY_REGEX:-10[[:space:]]+2[[:space:]]+\*[[:space:]]+\*[[:space:]]+\*}"
SCHEDULE_WEEKLY_REGEX="${OBS_CRON_SCHEDULE_WEEKLY_REGEX:-20[[:space:]]+2[[:space:]]+\*[[:space:]]+\*[[:space:]]+1}"
SCHEDULE_READINESS_REGEX="${OBS_CRON_SCHEDULE_READINESS_REGEX:-30[[:space:]]+2[[:space:]]+\*[[:space:]]+\*[[:space:]]+\*}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

CRON_CONTENT="$(crontab -l 2>/dev/null || true)"
[[ -n "$CRON_CONTENT" ]] || fail "crontab is empty or unavailable for current user"

non_comment_count="$(printf '%s\n' "$CRON_CONTENT" | rg -v '^\s*(#|$)' | wc -l | tr -d ' ')"
[[ "$non_comment_count" =~ ^[0-9]+$ ]] || non_comment_count=0
(( non_comment_count > 0 )) || fail "crontab has no active entries"

daily_pattern="${SCHEDULE_DAILY_REGEX}[[:space:]]+cd[[:space:]]+${CRON_EXPECT_ROOT_DIR}[[:space:]]+&&[[:space:]]+bash[[:space:]]+tools/observability_sample\.sh[[:space:]]+>>[[:space:]]+artifacts/observability/cron-sample\.log[[:space:]]+2>&1"
weekly_pattern="${SCHEDULE_WEEKLY_REGEX}[[:space:]]+cd[[:space:]]+${CRON_EXPECT_ROOT_DIR}[[:space:]]+&&[[:space:]]+OBS_SAMPLE_WITH_BASELINE=true[[:space:]]+bash[[:space:]]+tools/observability_sample\.sh[[:space:]]+>>[[:space:]]+artifacts/observability/cron-sample\.log[[:space:]]+2>&1"
readiness_pattern="${SCHEDULE_READINESS_REGEX}[[:space:]]+cd[[:space:]]+${CRON_EXPECT_ROOT_DIR}[[:space:]]+&&[[:space:]]+bash[[:space:]]+tools/observability_readiness_watch\.sh[[:space:]]+>>[[:space:]]+artifacts/observability/cron-readiness\.log[[:space:]]+2>&1"

daily_line="$(printf '%s\n' "$CRON_CONTENT" | rg -n "$daily_pattern" | head -n 1 || true)"
[[ -n "$daily_line" ]] || fail "missing daily observability sample cron entry"
pass "daily observability sample cron present"

weekly_line="$(printf '%s\n' "$CRON_CONTENT" | rg -n "$weekly_pattern" | head -n 1 || true)"
[[ -n "$weekly_line" ]] || fail "missing weekly baseline observability sample cron entry"
pass "weekly baseline observability sample cron present"

readiness_line="$(printf '%s\n' "$CRON_CONTENT" | rg -n "$readiness_pattern" | head -n 1 || true)"
[[ -n "$readiness_line" ]] || fail "missing readiness watch cron entry"
pass "readiness watch cron present"

mkdir -p "$(dirname "$OUTPUT_FILE")"

report_json="$(
  if command -v node >/dev/null 2>&1; then
    node - "$CRON_EXPECT_ROOT_DIR" "$daily_line" "$weekly_line" "$readiness_line" <<'NODE'
const [rootDir, dailyLine, weeklyLine, readinessLine] = process.argv.slice(2);
const payload = {
  measured_at: new Date().toISOString(),
  status: "pass",
  expected_root_dir: rootDir,
  entries: {
    daily_sample: dailyLine,
    weekly_baseline: weeklyLine,
    readiness_watch: readinessLine,
  },
};
process.stdout.write(JSON.stringify(payload));
NODE
  else
    docker run --rm -i -v "$PWD":/work -w /work node:20-alpine node - "$CRON_EXPECT_ROOT_DIR" "$daily_line" "$weekly_line" "$readiness_line" <<'NODE'
const [rootDir, dailyLine, weeklyLine, readinessLine] = process.argv.slice(2);
const payload = {
  measured_at: new Date().toISOString(),
  status: "pass",
  expected_root_dir: rootDir,
  entries: {
    daily_sample: dailyLine,
    weekly_baseline: weeklyLine,
    readiness_watch: readinessLine,
  },
};
process.stdout.write(JSON.stringify(payload));
NODE
  fi
)"
printf '%s\n' "$report_json" > "$OUTPUT_FILE"

pass "report written -> ${OUTPUT_FILE}"
echo "OBSERVABILITY CRON SCHEDULE: PASS"
