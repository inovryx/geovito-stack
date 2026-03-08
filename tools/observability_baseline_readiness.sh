#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASELINE_DAYS="${OBS_BASELINE_DAYS:-7}"
MIN_SAMPLES="${OBS_BASELINE_MIN_SAMPLES:-7}"
MIN_DISTINCT_DAYS="${OBS_BASELINE_MIN_DISTINCT_DAYS:-7}"
STRICT_MODE="${OBS_BASELINE_READINESS_STRICT:-false}"
ERROR_HISTORY_FILE="${ERROR_RATE_HISTORY_FILE:-artifacts/observability/error-rate-history.jsonl}"
STORAGE_HISTORY_FILE="${STORAGE_HISTORY_FILE:-artifacts/observability/storage-pressure-history.jsonl}"
OUTPUT_FILE="${OBS_BASELINE_READINESS_OUTPUT_FILE:-artifacts/observability/baseline-readiness-last.json}"

pass() { echo "PASS: $1"; }
warn() { echo "WARN: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

[[ "$BASELINE_DAYS" =~ ^[0-9]+$ ]] || fail "OBS_BASELINE_DAYS must be integer"
[[ "$MIN_SAMPLES" =~ ^[0-9]+$ ]] || fail "OBS_BASELINE_MIN_SAMPLES must be integer"
[[ "$MIN_DISTINCT_DAYS" =~ ^[0-9]+$ ]] || fail "OBS_BASELINE_MIN_DISTINCT_DAYS must be integer"
[[ -f "$ERROR_HISTORY_FILE" ]] || fail "missing error-rate history: $ERROR_HISTORY_FILE"
[[ -f "$STORAGE_HISTORY_FILE" ]] || fail "missing storage history: $STORAGE_HISTORY_FILE"

if command -v node >/dev/null 2>&1; then
  js_runner=(node -)
else
  command -v docker >/dev/null 2>&1 || fail "node or docker is required"
  js_runner=(docker run --rm -i -v "$PWD":/work -w /work node:20-alpine node -)
fi

set +e
calc_output="$(
  "${js_runner[@]}" "$ERROR_HISTORY_FILE" "$STORAGE_HISTORY_FILE" "$BASELINE_DAYS" "$MIN_SAMPLES" "$MIN_DISTINCT_DAYS" <<'NODE'
const fs = require('fs');

const [errorFile, storageFile, daysRaw, minSamplesRaw, minDistinctDaysRaw] = process.argv.slice(2);
const baselineDays = Number(daysRaw);
const minSamples = Number(minSamplesRaw);
const minDistinctDays = Number(minDistinctDaysRaw);
const cutoff = Date.now() - baselineDays * 24 * 60 * 60 * 1000;

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

function sampleTs(row) {
  const raw = row.measured_at || row.ts;
  const ts = Date.parse(String(raw || ''));
  return Number.isFinite(ts) ? ts : null;
}

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

const errorRows = readJsonl(errorFile).filter((row) => {
  const ts = sampleTs(row);
  return ts !== null && ts >= cutoff;
});

const storageRows = readJsonl(storageFile).filter((row) => {
  const ts = sampleTs(row);
  return ts !== null && ts >= cutoff;
});

const errorDays = new Set(errorRows.map((row) => dayKey(sampleTs(row))));
const storageDays = new Set(storageRows.map((row) => dayKey(sampleTs(row))));

const ready =
  errorRows.length >= minSamples &&
  storageRows.length >= minSamples &&
  errorDays.size >= minDistinctDays &&
  storageDays.size >= minDistinctDays;

const deficits = {
  error_samples: Math.max(0, minSamples - errorRows.length),
  storage_samples: Math.max(0, minSamples - storageRows.length),
  error_distinct_days: Math.max(0, minDistinctDays - errorDays.size),
  storage_distinct_days: Math.max(0, minDistinctDays - storageDays.size),
};

const report = {
  measured_at: new Date().toISOString(),
  baseline_days: baselineDays,
  minimums: {
    samples_per_stream: minSamples,
    distinct_days_per_stream: minDistinctDays,
  },
  observed: {
    error_samples: errorRows.length,
    storage_samples: storageRows.length,
    error_distinct_days: errorDays.size,
    storage_distinct_days: storageDays.size,
  },
  deficits,
  ready,
};

process.stdout.write(`JSON_OUTPUT:${JSON.stringify(report)}\n`);
if (!ready) process.exit(2);
NODE
)"
status=$?
set -e

summary_json="$(printf '%s\n' "$calc_output" | sed -n 's/^JSON_OUTPUT://p' | tail -n 1)"
[[ -n "$summary_json" ]] || fail "readiness calculator did not emit JSON output"

mkdir -p "$(dirname "$OUTPUT_FILE")"
printf '%s\n' "$summary_json" > "$OUTPUT_FILE"
pass "report written -> ${OUTPUT_FILE}"

if [[ $status -eq 0 ]]; then
  pass "baseline readiness is satisfied"
  echo "OBS BASELINE READINESS: PASS"
  exit 0
fi

deficit_summary="$(
  if command -v node >/dev/null 2>&1; then
    node - "$summary_json" <<'NODE'
const row = JSON.parse(process.argv[2] || '{}');
const d = row.deficits || {};
process.stdout.write(
  `error_samples=${d.error_samples ?? "?"},storage_samples=${d.storage_samples ?? "?"},error_days=${d.error_distinct_days ?? "?"},storage_days=${d.storage_distinct_days ?? "?"}`
);
NODE
  else
    docker run --rm -i -v "$PWD":/work -w /work node:20-alpine node - "$summary_json" <<'NODE'
const row = JSON.parse(process.argv[2] || '{}');
const d = row.deficits || {};
process.stdout.write(
  `error_samples=${d.error_samples ?? "?"},storage_samples=${d.storage_samples ?? "?"},error_days=${d.error_distinct_days ?? "?"},storage_days=${d.storage_distinct_days ?? "?"}`
);
NODE
  fi
)"

if [[ "$STRICT_MODE" == "true" ]]; then
  fail "baseline readiness is not satisfied (strict mode, deficits: ${deficit_summary})"
fi

warn "baseline readiness is not satisfied yet (non-strict mode, deficits: ${deficit_summary})"
echo "OBS BASELINE READINESS: WARN"
exit 0
