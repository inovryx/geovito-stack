#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASELINE_DAYS="${OBS_BASELINE_DAYS:-7}"
ERROR_HISTORY_FILE="${ERROR_RATE_HISTORY_FILE:-artifacts/observability/error-rate-history.jsonl}"
STORAGE_HISTORY_FILE="${STORAGE_HISTORY_FILE:-artifacts/observability/storage-pressure-history.jsonl}"
OUTPUT_ENV_FILE="${OBS_THRESHOLD_OUTPUT_FILE:-artifacts/observability/thresholds.env}"
SUMMARY_FILE="${OBS_BASELINE_SUMMARY_FILE:-artifacts/observability/threshold-baseline-summary.json}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

[[ "$BASELINE_DAYS" =~ ^[0-9]+$ ]] || fail "OBS_BASELINE_DAYS must be integer"
[[ -f "$ERROR_HISTORY_FILE" ]] || fail "missing error-rate history: $ERROR_HISTORY_FILE"
[[ -f "$STORAGE_HISTORY_FILE" ]] || fail "missing storage history: $STORAGE_HISTORY_FILE"

mkdir -p "$(dirname "$OUTPUT_ENV_FILE")"
mkdir -p "$(dirname "$SUMMARY_FILE")"

if command -v node >/dev/null 2>&1; then
  js_runner=(node -)
else
  command -v docker >/dev/null 2>&1 || fail "node or docker is required"
  js_runner=(docker run --rm -i -v "$PWD":/work -w /work node:20-alpine node -)
fi

calc_output="$(
  "${js_runner[@]}" "$ERROR_HISTORY_FILE" "$STORAGE_HISTORY_FILE" "$BASELINE_DAYS" <<'NODE'
const fs = require('fs');

const [errorFile, storageFile, daysRaw] = process.argv.slice(2);
const days = Number(daysRaw);
const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function toTs(row) {
  const value = row.measured_at || row.ts;
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : null;
}

const errorRows = readJsonl(errorFile).filter((row) => {
  const ts = toTs(row);
  return ts !== null && ts >= cutoff;
});
const storageRows = readJsonl(storageFile).filter((row) => {
  const ts = toTs(row);
  return ts !== null && ts >= cutoff;
});

if (errorRows.length === 0) {
  console.error('NO_ERROR_DATA');
  process.exit(2);
}
if (storageRows.length === 0) {
  console.error('NO_STORAGE_DATA');
  process.exit(3);
}

const max5xx = Math.max(...errorRows.map((r) => Number(r.count_5xx || 0)));
const maxAuth = Math.max(...errorRows.map((r) => Number(r.count_auth_fail || 0)));
const maxMod = Math.max(...errorRows.map((r) => Number(r.count_moderation_fail || 0)));
const maxDisk = Math.max(...storageRows.map((r) => Number(r.disk_usage_percent || 0)));
const maxUploads = Math.max(...storageRows.map((r) => Number(r.upload_bytes || 0)));

const recommend = {
  ERROR_RATE_WINDOW_MINUTES: 15,
  ERROR_RATE_MAX_5XX: Math.max(10, Math.ceil(max5xx * 1.5) + 1),
  ERROR_RATE_MAX_AUTH_FAIL: Math.max(25, Math.ceil(maxAuth * 1.5) + 1),
  ERROR_RATE_MAX_MOD_FAIL: Math.max(10, Math.ceil(maxMod * 1.5) + 1),
  ERROR_RATE_MOD_FAIL_MIN_STATUS: 500,
  STORAGE_DISK_WARN_PERCENT: Math.min(95, Math.max(85, Math.ceil(maxDisk + 10))),
  STORAGE_UPLOAD_WARN_BYTES: Math.max(32212254720, Math.ceil(maxUploads * 1.3)),
};

const summary = {
  generated_at: new Date().toISOString(),
  baseline_days: days,
  sample_count: {
    error_rate: errorRows.length,
    storage: storageRows.length,
  },
  maxima: {
    count_5xx: max5xx,
    count_auth_fail: maxAuth,
    count_moderation_fail: maxMod,
    disk_usage_percent: maxDisk,
    upload_bytes: maxUploads,
  },
  recommended_thresholds: recommend,
};

process.stdout.write(`JSON_OUTPUT:${JSON.stringify(summary)}\n`);
NODE
)"

summary_json="$(printf '%s\n' "$calc_output" | sed -n 's/^JSON_OUTPUT://p' | tail -n 1)"
[[ -n "$summary_json" ]] || fail "baseline calculator did not emit JSON output"
printf '%s\n' "$summary_json" > "$SUMMARY_FILE"
pass "baseline summary written -> ${SUMMARY_FILE}"

readarray -t env_lines < <(
  "${js_runner[@]}" "$summary_json" <<'NODE'
const summaryRaw = process.argv[2] || '{}';
const row = JSON.parse(summaryRaw);
const t = row.recommended_thresholds || {};
console.log(`# generated_at=${row.generated_at}`);
console.log(`# baseline_days=${row.baseline_days}`);
console.log(`# samples_error_rate=${row.sample_count?.error_rate ?? 0}`);
console.log(`# samples_storage=${row.sample_count?.storage ?? 0}`);
for (const key of [
  'ERROR_RATE_WINDOW_MINUTES',
  'ERROR_RATE_MAX_5XX',
  'ERROR_RATE_MAX_AUTH_FAIL',
  'ERROR_RATE_MAX_MOD_FAIL',
  'ERROR_RATE_MOD_FAIL_MIN_STATUS',
  'STORAGE_DISK_WARN_PERCENT',
  'STORAGE_UPLOAD_WARN_BYTES',
]) {
  if (Object.prototype.hasOwnProperty.call(t, key)) {
    console.log(`${key}=${t[key]}`);
  }
}
NODE
)

{
  for line in "${env_lines[@]}"; do
    printf '%s\n' "$line"
  done
} > "$OUTPUT_ENV_FILE"
pass "threshold env written -> ${OUTPUT_ENV_FILE}"

echo "OBSERVABILITY BASELINE: PASS"
