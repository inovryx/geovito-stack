#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/tools/lib_log_contract.sh"
gv_log_contract_init "scripts"

WINDOW_DAYS="${OBS_TREND_WINDOW_DAYS:-7}"
OBS_DIR="${OBS_TREND_DIR:-artifacts/observability}"
ERROR_HISTORY_FILE="${ERROR_RATE_HISTORY_FILE:-${OBS_DIR}/error-rate-history.jsonl}"
STORAGE_HISTORY_FILE="${STORAGE_HISTORY_FILE:-${OBS_DIR}/storage-pressure-history.jsonl}"
BASELINE_FILE="${OBS_BASELINE_READINESS_OUTPUT_FILE:-${OBS_DIR}/baseline-readiness-last.json}"
READINESS_STATE_FILE="${READINESS_WATCH_STATE_FILE:-${OBS_DIR}/readiness-watch-state.json}"
CRON_SCHEDULE_FILE="${OBS_CRON_SCHEDULE_FILE:-${OBS_DIR}/cron-schedule-last.json}"
CRON_FRESHNESS_FILE="${OBS_CRON_FRESHNESS_FILE:-${OBS_DIR}/cron-freshness-last.json}"
READINESS_CRON_FRESHNESS_FILE="${READINESS_CRON_FRESHNESS_FILE:-${OBS_DIR}/readiness-cron-freshness-last.json}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_JSON_FILE="${OBS_TREND_REPORT_JSON_FILE:-${OBS_DIR}/trend-report-last.json}"
REPORT_TXT_FILE="${OBS_TREND_REPORT_TXT_FILE:-${OBS_DIR}/trend-report-last.txt}"
STAMPED_JSON_FILE="${OBS_TREND_STAMPED_JSON_FILE:-${OBS_DIR}/trend-report-${STAMP}.json}"
STAMPED_TXT_FILE="${OBS_TREND_STAMPED_TXT_FILE:-${OBS_DIR}/trend-report-${STAMP}.txt}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

[[ "$WINDOW_DAYS" =~ ^[0-9]+$ ]] || fail "OBS_TREND_WINDOW_DAYS must be integer"
[[ -f "$ERROR_HISTORY_FILE" ]] || fail "missing error-rate history: $ERROR_HISTORY_FILE"
[[ -f "$STORAGE_HISTORY_FILE" ]] || fail "missing storage history: $STORAGE_HISTORY_FILE"
[[ -f "$BASELINE_FILE" ]] || fail "missing baseline readiness report: $BASELINE_FILE"
[[ -f "$READINESS_STATE_FILE" ]] || fail "missing readiness watch state: $READINESS_STATE_FILE"
[[ -f "$CRON_SCHEDULE_FILE" ]] || fail "missing cron schedule report: $CRON_SCHEDULE_FILE"
[[ -f "$CRON_FRESHNESS_FILE" ]] || fail "missing cron freshness report: $CRON_FRESHNESS_FILE"
[[ -f "$READINESS_CRON_FRESHNESS_FILE" ]] || fail "missing readiness cron freshness report: $READINESS_CRON_FRESHNESS_FILE"

mkdir -p "$OBS_DIR"

if command -v node >/dev/null 2>&1; then
  js_runner=(node -)
else
  command -v docker >/dev/null 2>&1 || fail "node or docker is required"
  js_runner=(docker run --rm -i -v "$PWD":/work -w /work node:20-alpine node -)
fi

"${js_runner[@]}" \
  "$ERROR_HISTORY_FILE" \
  "$STORAGE_HISTORY_FILE" \
  "$BASELINE_FILE" \
  "$READINESS_STATE_FILE" \
  "$CRON_SCHEDULE_FILE" \
  "$CRON_FRESHNESS_FILE" \
  "$READINESS_CRON_FRESHNESS_FILE" \
  "$WINDOW_DAYS" \
  "$REPORT_JSON_FILE" \
  "$REPORT_TXT_FILE" \
  "$STAMPED_JSON_FILE" \
  "$STAMPED_TXT_FILE" <<'NODE'
const fs = require('fs');

const [
  errorHistoryFile,
  storageHistoryFile,
  baselineFile,
  readinessStateFile,
  cronScheduleFile,
  cronFreshnessFile,
  readinessCronFreshnessFile,
  windowDaysRaw,
  reportJsonFile,
  reportTxtFile,
  stampedJsonFile,
  stampedTxtFile,
] = process.argv.slice(2);

const windowDays = Number(windowDaysRaw);
const now = Date.now();
const cutoff = now - windowDays * 24 * 60 * 60 * 1000;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function readJsonl(file) {
  try {
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
  } catch {
    return [];
  }
}

function toTs(raw) {
  const ts = Date.parse(String(raw || ''));
  return Number.isFinite(ts) ? ts : null;
}

function inWindow(row) {
  const ts = toTs(row.measured_at || row.ts);
  return ts !== null && ts >= cutoff;
}

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function avg(nums) {
  if (!nums.length) return 0;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round((sum / nums.length) * 100) / 100;
}

function maxOrZero(nums) {
  return nums.length ? Math.max(...nums) : 0;
}

function minOrZero(nums) {
  return nums.length ? Math.min(...nums) : 0;
}

const errorRows = readJsonl(errorHistoryFile).filter(inWindow);
const storageRows = readJsonl(storageHistoryFile).filter(inWindow);
const baseline = readJson(baselineFile);
const readinessState = readJson(readinessStateFile);
const cronSchedule = readJson(cronScheduleFile);
const cronFreshness = readJson(cronFreshnessFile);
const readinessCronFreshness = readJson(readinessCronFreshnessFile);

const errorDays = new Set();
const storageDays = new Set();

let latestErrorTs = null;
let latestStorageTs = null;

const error5xx = [];
const errorAuth = [];
const errorMod = [];
let errorThresholdBreaches = 0;

for (const row of errorRows) {
  const ts = toTs(row.measured_at || row.ts);
  if (ts !== null) {
    errorDays.add(dayKey(ts));
    if (latestErrorTs === null || ts > latestErrorTs) latestErrorTs = ts;
  }
  const c5xx = Number(row.count_5xx || 0);
  const cAuth = Number(row.count_auth_fail || 0);
  const cMod = Number(row.count_moderation_fail || 0);
  const t = row.thresholds || {};
  const t5xx = Number(t.max_5xx || 0);
  const tAuth = Number(t.max_auth_fail || 0);
  const tMod = Number(t.max_mod_fail || 0);
  error5xx.push(c5xx);
  errorAuth.push(cAuth);
  errorMod.push(cMod);
  if (c5xx > t5xx || cAuth > tAuth || cMod > tMod) {
    errorThresholdBreaches += 1;
  }
}

const storageDisk = [];
const storageUpload = [];
for (const row of storageRows) {
  const ts = toTs(row.measured_at || row.ts);
  if (ts !== null) {
    storageDays.add(dayKey(ts));
    if (latestStorageTs === null || ts > latestStorageTs) latestStorageTs = ts;
  }
  storageDisk.push(Number(row.disk_usage_percent || 0));
  storageUpload.push(Number(row.upload_bytes || 0));
}

const report = {
  generated_at: new Date(now).toISOString(),
  window_days: windowDays,
  files: {
    error_history: errorHistoryFile,
    storage_history: storageHistoryFile,
    baseline_report: baselineFile,
    readiness_state: readinessStateFile,
    cron_schedule: cronScheduleFile,
    cron_freshness: cronFreshnessFile,
    readiness_cron_freshness: readinessCronFreshnessFile,
  },
  error_rate: {
    samples: errorRows.length,
    distinct_days: errorDays.size,
    latest_measured_at: latestErrorTs ? new Date(latestErrorTs).toISOString() : null,
    max: {
      count_5xx: maxOrZero(error5xx),
      count_auth_fail: maxOrZero(errorAuth),
      count_moderation_fail: maxOrZero(errorMod),
    },
    avg: {
      count_5xx: avg(error5xx),
      count_auth_fail: avg(errorAuth),
      count_moderation_fail: avg(errorMod),
    },
    non_zero_samples: {
      count_5xx: error5xx.filter((x) => x > 0).length,
      count_auth_fail: errorAuth.filter((x) => x > 0).length,
      count_moderation_fail: errorMod.filter((x) => x > 0).length,
    },
    threshold_breach_samples: errorThresholdBreaches,
  },
  storage: {
    samples: storageRows.length,
    distinct_days: storageDays.size,
    latest_measured_at: latestStorageTs ? new Date(latestStorageTs).toISOString() : null,
    disk_usage_percent: {
      min: minOrZero(storageDisk),
      avg: avg(storageDisk),
      max: maxOrZero(storageDisk),
    },
    upload_bytes: {
      min: minOrZero(storageUpload),
      avg: avg(storageUpload),
      max: maxOrZero(storageUpload),
    },
  },
  readiness: {
    baseline_ready: Boolean(baseline.ready),
    baseline_measured_at: baseline.measured_at || null,
    observed: baseline.observed || {},
    deficits: baseline.deficits || {},
    watch_checked_at: readinessState.checked_at || null,
    watch_ready: Boolean(readinessState.ready),
    watch_previous_ready: Boolean(readinessState.previous_ready),
    watch_transitioned_to_ready: Boolean(readinessState.transitioned_to_ready),
    first_ready_at: readinessState.first_ready_at || null,
  },
  cron: {
    schedule_status: cronSchedule.status || 'unknown',
    sample_freshness_status: cronFreshness.status || 'unknown',
    sample_age_minutes: Number(cronFreshness.age_minutes || -1),
    readiness_freshness_status: readinessCronFreshness.status || 'unknown',
    readiness_age_minutes: Number(readinessCronFreshness.age_minutes || -1),
  },
};

report.status = {
  all_green:
    report.readiness.baseline_ready &&
    report.readiness.watch_ready &&
    report.cron.schedule_status === 'pass' &&
    report.cron.sample_freshness_status === 'pass' &&
    report.cron.readiness_freshness_status === 'pass' &&
    report.error_rate.threshold_breach_samples === 0,
};

const txt = [
  '==============================================================',
  'GEOVITO OBSERVABILITY TREND REPORT',
  '==============================================================',
  `generated_at=${report.generated_at}`,
  `window_days=${report.window_days}`,
  '',
  `[ERROR_RATE] samples=${report.error_rate.samples} distinct_days=${report.error_rate.distinct_days} latest=${report.error_rate.latest_measured_at || 'n/a'}`,
  `[ERROR_RATE] max_5xx=${report.error_rate.max.count_5xx} max_auth_fail=${report.error_rate.max.count_auth_fail} max_mod_fail=${report.error_rate.max.count_moderation_fail}`,
  `[ERROR_RATE] threshold_breach_samples=${report.error_rate.threshold_breach_samples}`,
  '',
  `[STORAGE] samples=${report.storage.samples} distinct_days=${report.storage.distinct_days} latest=${report.storage.latest_measured_at || 'n/a'}`,
  `[STORAGE] disk_usage_percent min/avg/max=${report.storage.disk_usage_percent.min}/${report.storage.disk_usage_percent.avg}/${report.storage.disk_usage_percent.max}`,
  `[STORAGE] upload_bytes min/avg/max=${report.storage.upload_bytes.min}/${report.storage.upload_bytes.avg}/${report.storage.upload_bytes.max}`,
  '',
  `[READINESS] baseline_ready=${report.readiness.baseline_ready} measured_at=${report.readiness.baseline_measured_at || 'n/a'}`,
  `[READINESS] observed error_samples=${report.readiness.observed.error_samples || 0} storage_samples=${report.readiness.observed.storage_samples || 0} error_days=${report.readiness.observed.error_distinct_days || 0} storage_days=${report.readiness.observed.storage_distinct_days || 0}`,
  `[WATCH] ready=${report.readiness.watch_ready} checked_at=${report.readiness.watch_checked_at || 'n/a'} first_ready_at=${report.readiness.first_ready_at || 'n/a'}`,
  '',
  `[CRON] schedule_status=${report.cron.schedule_status}`,
  `[CRON] sample_freshness=${report.cron.sample_freshness_status} age_minutes=${report.cron.sample_age_minutes}`,
  `[CRON] readiness_freshness=${report.cron.readiness_freshness_status} age_minutes=${report.cron.readiness_age_minutes}`,
  '',
  `OVERALL=${report.status.all_green ? 'PASS' : 'ATTN'}`,
].join('\n');

const jsonPayload = `${JSON.stringify(report, null, 2)}\n`;
fs.writeFileSync(reportJsonFile, jsonPayload);
fs.writeFileSync(stampedJsonFile, jsonPayload);
fs.writeFileSync(reportTxtFile, `${txt}\n`);
fs.writeFileSync(stampedTxtFile, `${txt}\n`);

process.stdout.write(txt + '\n');
NODE

pass "trend json written -> ${REPORT_JSON_FILE}"
pass "trend text written -> ${REPORT_TXT_FILE}"
pass "stamped json written -> ${STAMPED_JSON_FILE}"
pass "stamped text written -> ${STAMPED_TXT_FILE}"
gv_log_contract_emit "release" "info" "Observability trend report generated" "observability_trend_report.summary" 0 0 "window_days=${WINDOW_DAYS};overall=$(rg '^OVERALL=' "$REPORT_TXT_FILE" | sed 's/^OVERALL=//')"
