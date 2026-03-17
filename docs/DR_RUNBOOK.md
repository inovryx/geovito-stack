# Geovito Disaster Recovery Runbook

## Objective
Recover service state using one-command restore workflow and validate with smoke checks.

## Prerequisites
- `backup.env` configured with R2 + age keys.
- Latest backup exists and passes verify.
- Restore target defaults to staging.

## Backup flow
1. `bash tools/backup_run.sh`
2. `BACKUP_VERIFY_OFFSITE=true bash tools/backup_verify.sh`

### Scheduled backup (recommended)
Daily cron (UTC):

```bash
15 1 * * * cd /home/ali/geovito-stack && bash tools/backup_run.sh >> artifacts/dr/cron-backup.log 2>&1
```

## Restore flow (staging-first)
1. Identify backup stamp (example `20260306T170700Z`).
2. Restore data:
   - `bash tools/restore_run.sh <STAMP>`
3. Run restore smoke:
   - `BACKUP_STAMP=<STAMP> RESTORE_TARGET=staging bash tools/restore_smoke.sh`
4. Validate freshness SLA:
   - `bash tools/restore_freshness_check.sh`

### Scheduled restore smoke (recommended)
Weekly cron (UTC, Monday):

```bash
45 1 * * 1 cd /home/ali/geovito-stack && bash tools/dr_weekly_restore_cycle.sh >> artifacts/dr/cron-restore.log 2>&1
```

Validate cron schedule contract:

```bash
bash tools/dr_cron_schedule_check.sh
```

## Evidence artifacts
- `artifacts/dr/restore-last.json`
- `artifacts/dr/restore-smoke-last.json`

## Restore freshness SLA
- Last successful restore smoke must be within 14 days.
- Enforced by `tools/restore_freshness_check.sh` and full go-live gate.

## Failure handling
If restore or smoke fails:
1. Stop promotion to production.
2. Keep staging in investigation mode.
3. Create fresh backup and retry restore.
4. Document incident in runbook notes.
