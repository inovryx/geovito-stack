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

### Storage pressure
- `bash tools/storage_pressure_check.sh`
- Thresholds:
  - `STORAGE_DISK_WARN_PERCENT`
  - `STORAGE_UPLOAD_WARN_BYTES`

## Full gate integration
`tools/go_live_gate_full.sh` includes SEO drift, error-rate and storage checks by default.

## Response guidance
- Any critical check fail blocks production promotion.
- Trigger incident process and optionally apply kill switch.
