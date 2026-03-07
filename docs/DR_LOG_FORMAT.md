# DR Log Format

DR pipeline writes contract logs with `channel=dr`.

## Producers
- `tools/backup_run.sh`
- `tools/restore_run.sh`
- `tools/restore_smoke.sh`
- `tools/restore_freshness_check.sh`

## Minimum event pattern
- start events: `dr.*.start`
- completion events: `dr.*.complete`
- failures: `dr.*.error`

## Correlation
- `request_id` is script `RUN_ID`
- `meta.run_id` is always present
