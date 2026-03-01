# Geovito Emergency Runbook

## 1) Site or Build Mismatch
Symptoms:
- production shows old build SHA
- smoke fails with SHA mismatch

Actions:
1. Verify current head:
`git rev-parse --short=7 HEAD`
2. Force Pages deploy hook if needed:
`EXPECTED_SHA7=$(git rev-parse --short=7 HEAD) bash tools/pages_deploy_force.sh`
3. Verify smoke:
`bash tools/smoke_access.sh`

## 2) Access-Gated Smoke Failing
Symptoms:
- smoke reports "not API JSON" on fingerprint
- Cloudflare Access login HTML returned

Actions:
1. Confirm service token env is loaded (`smoke_access.env`).
2. Validate direct curl with headers.
3. Re-run:
`bash tools/smoke_access.sh`

## 3) Strapi Runtime Issues
Symptoms:
- API 5xx, login/register failures, health errors

Actions:
1. Restart stack:
`docker compose up -d --build strapi`
2. Health checks:
`bash tools/stack_health.sh`
3. If needed:
`bash tools/prod_health.sh`

## 4) Spam/Abuse Spike
Immediate controls:
1. Tighten guest comments and link policy (community settings/env fallback).
2. Run moderation/report queues with stricter triage.
3. Disable high-risk public write features temporarily (feature flags).

Validation:
- `bash tools/blog_engagement_policy_check.sh`
- `bash tools/ugc_api_contract_check.sh`

## 5) Regression in Core Contracts
Run full gate chain:
- `bash tools/pre_import_index_gate_check.sh`
- `bash tools/pre_design_gate_check.sh`

If failing:
1. Identify first failing gate.
2. Revert or hotfix only that scope.
3. Re-run full chain before redeploy.

## 6) Backup / Restore Drill
Before high-risk schema/content operations:
1. `bash tools/backup_create.sh`
2. `bash tools/backup_verify.sh`

If rollback is needed:
1. Identify snapshot stamp under backup root (default `~/backups/geovito`).
2. Restore DB:
`cat ~/backups/geovito/<STAMP>/postgres.sql | docker compose exec -T db sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`
3. Restore uploads:
`cat ~/backups/geovito/<STAMP>/uploads.tgz | docker compose exec -T strapi sh -lc 'tar -C /opt/app/public -xzf -'`
4. Run health and smoke:
- `bash tools/stack_health.sh`
- `bash tools/smoke_access.sh`
