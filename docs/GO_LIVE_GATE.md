# Geovito Go-Live Gate (PASS/FAIL)

Use this checklist before opening broader traffic.

## Production Standard (No-Skip)
Use the full hardening gate for production promotion:

```bash
bash tools/go_live_gate_full.sh
```

This command enforces:
- legacy core gate chain (`tools/go_live_gate.sh`)
- mandatory `Log Contract Smoke` inside the core gate path
- staging isolation checks
- restore freshness SLA checks
- kill-switch smoke
- audit-log smoke
- SEO drift check
- error-rate check
- storage pressure check
- observability cron freshness check
- baseline readiness check (non-strict by default)

Summary evidence is written under:
- `artifacts/go-live/go-live-full-<UTCSTAMP>.txt`

## Latest Stable Checkpoint
- Date (UTC): `2026-03-08`
- Tag: `checkpoint-go-live-full-pass-20260308-1443`
- Commit: `9b987e4`
- Full gate summary artifact: `artifacts/go-live/go-live-full-20260308T143031Z.txt`
- Outcome: `GO-LIVE FULL GATE: PASS (0 failed)`

### Emergency override (controlled)
Override is allowed only with explicit incident metadata and allowlist:

```bash
GO_LIVE_EMERGENCY_OVERRIDE=true \
GO_LIVE_OVERRIDE_TICKET=INC-1234 \
GO_LIVE_OVERRIDE_APPROVER=ops@geovito.com \
GO_LIVE_OVERRIDE_REASON=\"infra provider incident\" \
GO_LIVE_OVERRIDE_ALLOWLIST=\"Staging Isolation,Restore Freshness\" \
bash tools/go_live_gate_full.sh
```

Rules:
- missing ticket/approver/reason -> FAIL
- ticket format must look like `INC-1234` -> FAIL otherwise
- approver must be a valid email -> FAIL otherwise
- reason must be at least 12 chars -> FAIL otherwise
- failed step not in allowlist -> FAIL
- failed step must also be policy-allowed; fixed policy allowlist is:
  - `Staging Isolation`
  - `Restore Freshness`
  - `Error Rate Check`
  - `Storage Pressure Check`
- override action is audit-logged

Override-policy smoke:

```bash
bash tools/go_live_override_policy_smoke.sh
```

Disable override-policy smoke for emergency debugging only:

```bash
GO_LIVE_WITH_OVERRIDE_POLICY_SMOKE=false \
GO_LIVE_WITH_BACKUP_VERIFY=true \
GO_LIVE_WITH_SMTP=true \
RESET_SMOKE_EMAIL=you@example.com \
bash tools/go_live_gate_full.sh
```

Baseline readiness strict mode (optional hard enforcement):

```bash
GO_LIVE_BASELINE_READINESS_STRICT=true \
GO_LIVE_WITH_BACKUP_VERIFY=true \
GO_LIVE_WITH_SMTP=true \
RESET_SMOKE_EMAIL=you@example.com \
bash tools/go_live_gate_full.sh
```

## One-command Gate
Run:

```bash
bash tools/go_live_gate.sh
```

`Log Contract Smoke` now runs by default in `tools/go_live_gate.sh` and is not skipped.

Useful toggles:

```bash
# include creator profile route checks in smoke
CREATOR_USERNAME=olmysweet GO_LIVE_REQUIRE_CREATOR=true bash tools/go_live_gate.sh

# skip deploy trigger and only validate current production
GO_LIVE_WITH_DEPLOY=false bash tools/go_live_gate.sh

# include SMTP reset smoke
GO_LIVE_WITH_SMTP=true RESET_SMOKE_EMAIL=you@example.com bash tools/go_live_gate.sh

# include backup integrity verify (latest snapshot under BACKUP_ROOT)
GO_LIVE_WITH_BACKUP_VERIFY=true bash tools/go_live_gate.sh

# include UGC showcase moderation round-trip check
GO_LIVE_WITH_UGC_SHOWCASE_MOD=true CREATOR_USERNAME=olmysweet bash tools/go_live_gate.sh

# optional explicit owner + keep-approved mode
GO_LIVE_WITH_UGC_SHOWCASE_MOD=true \
GO_LIVE_UGC_SHOWCASE_OWNER_EMAIL=ali.koc.00@gmail.com \
GO_LIVE_UGC_SHOWCASE_RESTORE_TO_SUBMITTED=false \
CREATOR_USERNAME=olmysweet bash tools/go_live_gate.sh

# if /api/_health is token-protected
HEALTH_TOKEN=your_token_here bash tools/go_live_gate.sh

# skip report moderation smoke (not recommended for release)
GO_LIVE_SKIP_REPORT_SMOKE=true bash tools/go_live_gate.sh

# skip community settings smoke (not recommended for release)
GO_LIVE_SKIP_COMMUNITY_SETTINGS_SMOKE=true bash tools/go_live_gate.sh

# skip UGC API contract check (not recommended for release)
GO_LIVE_SKIP_UGC_API_CONTRACT=true bash tools/go_live_gate.sh

# skip UI page progress check (not recommended for release)
GO_LIVE_SKIP_UI_PAGE_PROGRESS=true bash tools/go_live_gate.sh

# skip dashboard role baseline smoke (not recommended for release)
GO_LIVE_SKIP_DASHBOARD_ROLE_SMOKE=true bash tools/go_live_gate.sh

# skip follow/notification foundation smokes (not recommended for release)
GO_LIVE_SKIP_FOLLOW_SMOKE=true GO_LIVE_SKIP_NOTIFICATION_SMOKE=true bash tools/go_live_gate.sh

# skip saved list foundation smoke (not recommended for release)
GO_LIVE_SKIP_SAVED_LIST_SMOKE=true bash tools/go_live_gate.sh
```

Optional secret-file setup for health token:

```bash
bash tools/stack_health_env_init.sh
nano ~/.config/geovito/health.env
```

## Core Infrastructure
- [ ] `bash tools/stack_health.sh` PASS
- [ ] `GO_LIVE_WITH_BACKUP_VERIFY=true bash tools/go_live_gate.sh` includes `Backup Verify` PASS
- [ ] `bash tools/prod_health.sh` PASS
- [ ] `bash tools/pages_build_check.sh` PASS
- [ ] `bash tools/staging_isolation_check.sh` PASS
- [ ] `bash tools/restore_freshness_check.sh` PASS

## Contract Gates
- [ ] `bash tools/pre_import_index_gate_check.sh` PASS
- [ ] `bash tools/pre_design_gate_check.sh` PASS
- [ ] Import remains dormant by default
- [ ] Translation bundle remains dormant by default
- [ ] AI flags remain OFF by default

## Deploy + Smoke
- [ ] production build fingerprint matches expected SHA
- [ ] `bash tools/smoke_access.sh` PASS
- [ ] `bash tools/post_deploy_smoke.sh` PASS

## Auth + Account
- [ ] register/login/forgot/reset flows operational
- [ ] SMTP reset smoke PASS
- [ ] account session persistence and logout verified

## UGC + Moderation
- [ ] submitted-visible posts show "In review"
- [ ] submitted-visible posts are noindex and sitemap-excluded
- [ ] approved-visible posts follow indexability gates
- [ ] `bash tools/report_moderation_smoke.sh` PASS
- [ ] `bash tools/community_settings_smoke.sh` PASS
- [ ] `bash tools/ugc_api_contract_check.sh` PASS
- [ ] `GO_LIVE_WITH_UGC_SHOWCASE_MOD=true bash tools/go_live_gate.sh` includes `UGC Showcase Moderation Check` PASS
- [ ] `bash tools/ui_page_progress_report.sh` PASS
- [ ] `bash tools/dashboard_role_smoke.sh` PASS
- [ ] `bash tools/follow_system_smoke.sh` PASS
- [ ] `bash tools/notification_preferences_smoke.sh` PASS
- [ ] `bash tools/saved_list_smoke.sh` PASS
- [ ] guest comment policy and link limits verified
- [ ] `bash tools/kill_switch_smoke.sh` PASS
- [ ] `bash tools/audit_log_smoke.sh` PASS
- [ ] `bash tools/seo_drift_check.sh` PASS
- [ ] `bash tools/error_rate_check.sh` PASS
- [ ] `bash tools/storage_pressure_check.sh` PASS
- [ ] `bash tools/observability_cron_freshness_check.sh` PASS
- [ ] `bash tools/observability_baseline_readiness.sh` PASS/WARN (strict mode requires PASS)

## Profile + Routing
- [ ] `/{lang}/@{username}` profile routes render
- [ ] `/@{username}` redirects to localized canonical route
- [ ] profile pages are noindex and excluded from sitemap

## Final Decision
- Production: `tools/go_live_gate_full.sh` must be PASS with `0 failed`.
- Any FAIL -> hold release, patch, rerun full gate.
- Emergency override is exception-only and must include ticket + approver + reason.
