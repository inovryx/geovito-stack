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

# send alert if any step fails
OBS_SAMPLE_ALERT_ON_FAIL=true bash tools/observability_sample.sh
```

Suggested schedule:
- daily: `bash tools/observability_sample.sh`
- weekly: `OBS_SAMPLE_WITH_BASELINE=true bash tools/observability_sample.sh`

Example cron (UTC):

```cron
# daily sample at 02:10 UTC
10 2 * * * cd /home/ali/geovito-stack && bash tools/observability_sample.sh >> artifacts/observability/cron-sample.log 2>&1

# weekly baseline refresh at 02:20 UTC on Monday
20 2 * * 1 cd /home/ali/geovito-stack && OBS_SAMPLE_WITH_BASELINE=true bash tools/observability_sample.sh >> artifacts/observability/cron-sample.log 2>&1
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

## Full gate integration
`tools/go_live_gate_full.sh` includes SEO drift, error-rate and storage checks by default.

## Response guidance
- Any critical check fail blocks production promotion.
- Trigger incident process and optionally apply kill switch.
