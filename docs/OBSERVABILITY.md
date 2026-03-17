# Geovito Observability and Alerts

## Alert channels
- Telegram (primary fast channel)
- Email (secondary/redundant channel)

Configured via:
- `ALERT_TELEGRAM_BOT_TOKEN`
- `ALERT_TELEGRAM_CHAT_ID`
- `ALERT_EMAIL_TO`
- `ALERT_EMAIL_FROM`

Send test alert:
- `bash tools/alert_send.sh "Geovito Test" "observability check"`

## Checks

### SEO drift
- `bash tools/seo_drift_check.sh`
- Verifies:
  - submitted UGC not in sitemap
  - profile pages excluded/noindex behavior preserved
  - atlas index gate unchanged

### Error rate
- `bash tools/error_rate_check.sh`
- Window and thresholds:
  - `ERROR_RATE_WINDOW_MINUTES`
  - `ERROR_RATE_MAX_5XX`
  - `ERROR_RATE_MAX_AUTH_FAIL`
  - `ERROR_RATE_MAX_MOD_FAIL`
- Outputs:
  - latest snapshot: `artifacts/observability/error-rate-last.json`
  - rolling history: `artifacts/observability/error-rate-history.jsonl`

### Storage pressure
- `bash tools/storage_pressure_check.sh`
- Thresholds:
  - `STORAGE_DISK_WARN_PERCENT`
  - `STORAGE_UPLOAD_WARN_BYTES`
- Outputs:
  - latest snapshot: `artifacts/observability/storage-pressure-last.json`
  - rolling history: `artifacts/observability/storage-pressure-history.jsonl`

## Threshold baseline calibration
Check readiness before locking thresholds:

```bash
bash tools/observability_baseline_readiness.sh
```

Defaults:
- needs at least `7` samples per stream in last `7` days
- needs at least `7` distinct days per stream
- non-strict mode returns `WARN` (exit `0`) when not ready

Strict mode:

```bash
OBS_BASELINE_READINESS_STRICT=true bash tools/observability_baseline_readiness.sh
```

Readiness artifact:
- `artifacts/observability/baseline-readiness-last.json`
  - includes `observed` and `deficits` blocks for sample/day gaps

Generate 7-day baseline recommendations:

```bash
bash tools/observability_threshold_baseline.sh
```

Artifacts:
- `artifacts/observability/threshold-baseline-summary.json`
- `artifacts/observability/thresholds.env`

Checks auto-load `artifacts/observability/thresholds.env` when present.

Optional explicit profile:

```bash
OBSERVABILITY_THRESHOLD_FILE=/path/to/thresholds.env bash tools/error_rate_check.sh
OBSERVABILITY_THRESHOLD_FILE=/path/to/thresholds.env bash tools/storage_pressure_check.sh
```

Recommendation:
- keep defaults for first week of data
- regenerate baseline weekly
- promote threshold changes only after at least 7 days of history

## Daily sampling workflow
Run a daily sample (updates history files + snapshot reports):

```bash
bash tools/observability_sample.sh
```

Optional flags:

```bash
# include seo drift in the same sample run
OBS_SAMPLE_WITH_SEO=true bash tools/observability_sample.sh

# refresh threshold baseline in the same run (recommended weekly)
OBS_SAMPLE_WITH_BASELINE=true bash tools/observability_sample.sh

# force baseline refresh even if readiness is not met
OBS_SAMPLE_WITH_BASELINE=true OBS_SAMPLE_BASELINE_REQUIRE_READY=false bash tools/observability_sample.sh

# send alert if any step fails
OBS_SAMPLE_ALERT_ON_FAIL=true bash tools/observability_sample.sh
```

Suggested schedule:
- daily: `bash tools/observability_sample.sh`
- weekly: `OBS_SAMPLE_WITH_BASELINE=true bash tools/observability_sample.sh`
- daily trend summary: `bash tools/observability_trend_report.sh`

Example cron (UTC):

```cron
# daily sample at 02:10 UTC
10 2 * * * cd /home/ali/geovito-stack && bash tools/observability_sample.sh >> artifacts/observability/cron-sample.log 2>&1

# weekly baseline refresh at 02:20 UTC on Monday
20 2 * * 1 cd /home/ali/geovito-stack && OBS_SAMPLE_WITH_BASELINE=true bash tools/observability_sample.sh >> artifacts/observability/cron-sample.log 2>&1

# daily trend report at 02:40 UTC
40 2 * * * cd /home/ali/geovito-stack && bash tools/observability_trend_report.sh >> artifacts/observability/cron-trend.log 2>&1
```

## Cron log rotation
Keep `cron-sample.log` bounded with logrotate:

```conf
/home/ali/geovito-stack/artifacts/observability/cron-sample.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su ali ali
}
```

Setup and verify:

```bash
sudo tee /etc/logrotate.d/geovito-observability >/dev/null <<'EOF'
/home/ali/geovito-stack/artifacts/observability/cron-sample.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su ali ali
}
EOF

sudo logrotate -d /etc/logrotate.d/geovito-observability
sudo logrotate -f /etc/logrotate.d/geovito-observability
```

## Cron freshness check
Validate that the latest cron sample is recent enough:

```bash
bash tools/observability_cron_freshness_check.sh
```

Optional tuning:
- `OBS_CRON_MAX_AGE_MINUTES` (default: `1560`, ~26h)
- `OBS_CRON_LOG_FILE` (default: `artifacts/observability/cron-sample.log`)
- `OBS_CRON_REQUIRE_PASS_MARKER` (default: `true`)

Output:
- `artifacts/observability/cron-freshness-last.json`
- if current log file is empty after rotation, checker falls back to `.1`

Validate cron schedule drift (required entries exist in current user crontab):

```bash
bash tools/observability_cron_schedule_check.sh
```

Optional tuning:
- `OBS_CRON_EXPECT_ROOT_DIR` (default: current repo path)
- `OBS_CRON_SCHEDULE_DAILY_REGEX` (default: `10 2 * * *` equivalent regex)
- `OBS_CRON_SCHEDULE_WEEKLY_REGEX` (default: `20 2 * * 1` equivalent regex)
- `OBS_CRON_SCHEDULE_READINESS_REGEX` (default: `30 2 * * *` equivalent regex)

Output:
- `artifacts/observability/cron-schedule-last.json`

Validate readiness-watch cron freshness:

```bash
bash tools/observability_readiness_cron_freshness_check.sh
```

Optional tuning:
- `OBS_READINESS_CRON_MAX_AGE_MINUTES` (default: `1560`, ~26h)
- `OBS_READINESS_CRON_LOG_FILE` (default: `artifacts/observability/cron-readiness.log`)
- `OBS_READINESS_CRON_REQUIRE_MARKER` (default: `true`)

Output:
- `artifacts/observability/readiness-cron-freshness-last.json`
- if current log file is empty after rotation, checker falls back to `.1`

Validate trend-report freshness:

```bash
bash tools/observability_trend_freshness_check.sh
```

Optional tuning:
- `OBS_TREND_REPORT_FILE` (default: `artifacts/observability/trend-report-last.json`)
- `OBS_TREND_MAX_AGE_MINUTES` (default: `1560`, ~26h)
- `OBS_TREND_REQUIRE_GREEN_STATUS` (default: `true`)
- `OBS_TREND_OUTPUT_FILE` (default: `artifacts/observability/trend-freshness-last.json`)

Output:
- `artifacts/observability/trend-freshness-last.json`
- fails if trend timestamp is stale or `status.all_green` is not `true`

## Readiness watch (strict gate preparation)
Track baseline readiness transitions automatically:

```bash
bash tools/observability_readiness_watch.sh
```

Outputs:
- state snapshot: `artifacts/observability/readiness-watch-state.json`
- latest readiness report: `artifacts/observability/baseline-readiness-last.json`

Behavior:
- runs baseline readiness check in non-strict mode
- records `ready/not_ready` state and transition info
- if state transitions from `not_ready` to `ready`, optionally sends alert via `tools/alert_send.sh`
- alert body includes strict full-gate command to run immediately

Optional tuning:
- `OBS_READINESS_WATCH_SKIP_BASELINE_CHECK` (default: `false`) to reuse an existing report file
- `OBS_READINESS_WATCH_ALERT_ON_READY` (default: `true`)

Suggested cron (UTC), after daily sample:

```cron
30 2 * * * cd /home/ali/geovito-stack && bash tools/observability_readiness_watch.sh >> artifacts/observability/cron-readiness.log 2>&1
```

Validate watch transition behavior locally:

```bash
bash tools/observability_readiness_watch_smoke.sh
```

## Full gate integration
`tools/go_live_gate_full.sh` includes SEO drift, error-rate, storage, cron schedule/freshness, readiness-watch checks, and trend freshness checks by default.

## Response guidance
- Any critical check fail blocks production promotion.
- Trigger incident process and optionally apply kill switch.
