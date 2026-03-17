#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TREND_REPORT_FILE="${OBS_TREND_REPORT_FILE:-artifacts/observability/trend-report-last.json}"
MAX_AGE_MINUTES="${OBS_TREND_MAX_AGE_MINUTES:-1560}"
REQUIRE_GREEN_STATUS="${OBS_TREND_REQUIRE_GREEN_STATUS:-true}"
OUTPUT_FILE="${OBS_TREND_OUTPUT_FILE:-artifacts/observability/trend-freshness-last.json}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

[[ "$MAX_AGE_MINUTES" =~ ^[0-9]+$ ]] || fail "OBS_TREND_MAX_AGE_MINUTES must be integer"
[[ -f "$TREND_REPORT_FILE" ]] || fail "trend report missing: ${TREND_REPORT_FILE}"

latest_ts="$(rg -o '"generated_at"\s*:\s*"[^"]+"' "$TREND_REPORT_FILE" | tail -n 1 | sed -E 's/^"generated_at"\s*:\s*"([^"]+)"$/\1/')"
[[ -n "$latest_ts" ]] || fail "could not extract generated_at from trend report: ${TREND_REPORT_FILE}"

if [[ "$REQUIRE_GREEN_STATUS" == "true" ]]; then
  if ! rg -q '"all_green"\s*:\s*true' "$TREND_REPORT_FILE"; then
    fail "trend report status.all_green is not true (${TREND_REPORT_FILE})"
  fi
fi

now_epoch="$(date -u +%s)"
latest_epoch="$(date -u -d "$latest_ts" +%s 2>/dev/null || true)"
if [[ ! "$latest_epoch" =~ ^[0-9]+$ ]]; then
  fail "could not parse trend timestamp: ${latest_ts}"
fi

age_minutes="$(( (now_epoch - latest_epoch) / 60 ))"
if (( age_minutes < 0 )); then
  fail "trend timestamp is in the future (latest_ts=${latest_ts})"
fi

mkdir -p "$(dirname "$OUTPUT_FILE")"
status_value="pass"
if (( age_minutes > MAX_AGE_MINUTES )); then
  status_value="fail"
fi

report_json="$(
  if command -v node >/dev/null 2>&1; then
    node - "$latest_ts" "$age_minutes" "$MAX_AGE_MINUTES" "$status_value" "$TREND_REPORT_FILE" <<'NODE'
const [latestTs, ageMinutes, maxAgeMinutes, statusValue, reportFile] = process.argv.slice(2);
const payload = {
  measured_at: new Date().toISOString(),
  latest_trend_ts: latestTs,
  age_minutes: Number(ageMinutes),
  max_age_minutes: Number(maxAgeMinutes),
  status: statusValue,
  trend_report_file: reportFile,
};
process.stdout.write(JSON.stringify(payload));
NODE
  else
    docker run --rm -i -v "$PWD":/work -w /work node:20-alpine node - "$latest_ts" "$age_minutes" "$MAX_AGE_MINUTES" "$status_value" "$TREND_REPORT_FILE" <<'NODE'
const [latestTs, ageMinutes, maxAgeMinutes, statusValue, reportFile] = process.argv.slice(2);
const payload = {
  measured_at: new Date().toISOString(),
  latest_trend_ts: latestTs,
  age_minutes: Number(ageMinutes),
  max_age_minutes: Number(maxAgeMinutes),
  status: statusValue,
  trend_report_file: reportFile,
};
process.stdout.write(JSON.stringify(payload));
NODE
  fi
)"
printf '%s\n' "$report_json" > "$OUTPUT_FILE"

if (( age_minutes > MAX_AGE_MINUTES )); then
  fail "trend report is stale (age=${age_minutes}m > max=${MAX_AGE_MINUTES}m). report=${OUTPUT_FILE}"
fi

pass "trend report freshness age=${age_minutes}m within max=${MAX_AGE_MINUTES}m"
pass "report written -> ${OUTPUT_FILE}"
echo "OBSERVABILITY TREND FRESHNESS: PASS"
