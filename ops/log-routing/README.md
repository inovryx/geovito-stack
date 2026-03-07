# Log Routing Templates (Disabled)

This folder prepares future continuous log shipping. Templates are not active by default.

## Goal
- Read contract JSON lines from app host
- Split by channel
- Forward to dedicated log VPS
- Keep local buffer if remote is unavailable

## Required vars
- `LOG_VPS_HOST`
- `LOG_VPS_PORT`
- `LOG_RETENTION_DAYS_HOT` (default 14)
- `LOG_ARCHIVE_DAYS` (default 90)
- `PROD_BUFFER_HOURS` (default 48)

## Templates
- `templates/prod_log_router.template`
- `templates/logvps_ingest.template`

Adapt these to your chosen agent (vector/fluent-bit/rsyslog) during activation.
