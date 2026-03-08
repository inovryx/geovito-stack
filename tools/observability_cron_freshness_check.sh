#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CRON_LOG_FILE="${OBS_CRON_LOG_FILE:-artifacts/observability/cron-sample.log}"
MAX_AGE_MINUTES="${OBS_CRON_MAX_AGE_MINUTES:-1560}"
REQUIRE_PASS_MARKER="${OBS_CRON_REQUIRE_PASS_MARKER:-true}"
OUTPUT_FILE="${OBS_CRON_OUTPUT_FILE:-artifacts/observability/cron-freshness-last.json}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

[[ "$MAX_AGE_MINUTES" =~ ^[0-9]+$ ]] || fail "OBS_CRON_MAX_AGE_MINUTES must be integer"
[[ -f "$CRON_LOG_FILE" ]] || fail "cron log not found: $CRON_LOG_FILE"
[[ -s "$CRON_LOG_FILE" ]] || fail "cron log is empty: $CRON_LOG_FILE"

if [[ "$REQUIRE_PASS_MARKER" == "true" ]]; then
  if ! rg -q "OBSERVABILITY SAMPLE: PASS" "$CRON_LOG_FILE"; then
    fail "cron log has no OBSERVABILITY SAMPLE: PASS marker"
  fi
fi

latest_ts="$(rg -o '"ts":"[^"]+"' "$CRON_LOG_FILE" | tail -n 1 | sed -E 's/^"ts":"([^"]+)"$/\1/')"
[[ -n "$latest_ts" ]] || fail "could not extract latest ts from cron log"

now_epoch="$(date -u +%s)"
latest_epoch="$(date -u -d "$latest_ts" +%s 2>/dev/null || true)"
if [[ ! "$latest_epoch" =~ ^[0-9]+$ ]]; then
  fail "could not parse latest timestamp: ${latest_ts}"
fi

age_minutes="$(( (now_epoch - latest_epoch) / 60 ))"
if (( age_minutes < 0 )); then
  fail "cron timestamp is in the future (latest_ts=${latest_ts})"
fi

mkdir -p "$(dirname "$OUTPUT_FILE")"
status_value="pass"
if (( age_minutes > MAX_AGE_MINUTES )); then
  status_value="fail"
fi

report_json="$(
  if command -v node >/dev/null 2>&1; then
    node - "$latest_ts" "$age_minutes" "$MAX_AGE_MINUTES" "$status_value" "$CRON_LOG_FILE" <<'NODE'
const [latestTs, ageMinutes, maxAgeMinutes, statusValue, logFile] = process.argv.slice(2);
const payload = {
  measured_at: new Date().toISOString(),
  latest_sample_ts: latestTs,
  age_minutes: Number(ageMinutes),
  max_age_minutes: Number(maxAgeMinutes),
  status: statusValue,
  log_file: logFile,
};
process.stdout.write(JSON.stringify(payload));
NODE
  else
    docker run --rm -i -v "$PWD":/work -w /work node:20-alpine node - "$latest_ts" "$age_minutes" "$MAX_AGE_MINUTES" "$status_value" "$CRON_LOG_FILE" <<'NODE'
const [latestTs, ageMinutes, maxAgeMinutes, statusValue, logFile] = process.argv.slice(2);
const payload = {
  measured_at: new Date().toISOString(),
  latest_sample_ts: latestTs,
  age_minutes: Number(ageMinutes),
  max_age_minutes: Number(maxAgeMinutes),
  status: statusValue,
  log_file: logFile,
};
process.stdout.write(JSON.stringify(payload));
NODE
  fi
)"
printf '%s\n' "$report_json" > "$OUTPUT_FILE"

if (( age_minutes > MAX_AGE_MINUTES )); then
  fail "cron sample is stale (age=${age_minutes}m > max=${MAX_AGE_MINUTES}m). report=${OUTPUT_FILE}"
fi

pass "cron sample freshness age=${age_minutes}m within max=${MAX_AGE_MINUTES}m"
pass "report written -> ${OUTPUT_FILE}"
echo "OBSERVABILITY CRON FRESHNESS: PASS"
