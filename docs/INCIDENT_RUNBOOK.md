# Geovito Incident Runbook

## 1) Abuse spike / spam wave
Immediate containment:
1. `INCIDENT_ID=<id> APPROVER_EMAIL=<mail> REASON='<reason>' bash tools/kill_switch_apply.sh`
2. Optional submitted-content hide:
   - `INCIDENT_ID=<id> APPROVER_EMAIL=<mail> REASON='<reason>' bash tools/submitted_visibility_freeze.sh`
3. Validate enforcement:
   - `bash tools/kill_switch_smoke.sh`

Recovery:
1. Clear kill switch from snapshot:
   - `INCIDENT_ID=<id> APPROVER_EMAIL=<mail> REASON='all clear' bash tools/kill_switch_clear.sh`
2. Restore submitted visibility if frozen:
   - `INCIDENT_ID=<id> APPROVER_EMAIL=<mail> REASON='all clear' bash tools/submitted_visibility_restore.sh`

## 2) SEO drift incident
1. `bash tools/seo_drift_check.sh`
2. If fail, stop deploy and inspect latest content changes.
3. Run full gate before reopening release.

## 3) Error spike incident
1. `bash tools/error_rate_check.sh`
2. `bash tools/storage_pressure_check.sh`
3. If threshold breached, alert and hold release.

## 4) Restore requirement
1. Verify backup:
   - `BACKUP_VERIFY_OFFSITE=true bash tools/backup_verify.sh`
2. Restore into staging:
   - `bash tools/restore_run.sh <STAMP>`
   - `BACKUP_STAMP=<STAMP> RESTORE_TARGET=staging bash tools/restore_smoke.sh`

## 5) Post-incident closure
- Confirm audit entries exist:
  - `bash tools/audit_log_smoke.sh`
- Record incident ID, approver, reason, and recovery timestamp.
