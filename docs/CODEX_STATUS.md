# CODEX STATUS

Last updated (UTC): 2026-03-08T16:20:00Z
Repo: `/home/ali/geovito-stack`
Branch: `main`
Head at last full verification: `02eaf35`

## Current Project Snapshot
- Core is stable and green: Clean Core contracts, Atlas SEO gate, dormant guards, and existing smoke/gate chain are preserved.
- UGC + Community backbone is active: creator profiles, moderation flows, reports, account requests, community settings, follow/preferences/saved-list foundations.
- Hardening pack baseline is integrated: staging isolation checks, DR freshness checks, kill switch smokes, audit log smokes, SEO drift/error/storage checks, full go-live gate script.
- Log Foundation v1 is integrated in dual-write mode: legacy domain logs kept, structured channel logs added (`app/security/moderation/audit/release/dr`) with request correlation and redaction.

## Completed Recent Work
- `fix(staging): render robots route at runtime for host-aware lockdown`
- `docs(release): record latest full go-live pass checkpoint`
- `feat(logging): add structured contract logger with dual-write bridge`
- `feat(correlation): enforce request_id across strapi and critical frontend calls`
- `feat(audit): emit audit channel lines for privileged actions`
- `feat(logging-scripts): add machine-readable release/dr logs with run_id`
- `docs(logging): add contract and future router templates`
- `test(logging): add log contract smoke and full-gate integration hook`
- `fix(gates): stabilize shell smoke banner expectations and tighten moderation error-rate counting`
- `fix(logging): fallback to artifacts log root when logs/channels is not writable`
- `feat(gate): enforce log contract smoke in full gate`
- `fix(smoke): stabilize region and related-link checks for shell smoke`
- New checkpoint tag: `checkpoint-go-live-full-pass-20260307-2031`
- New checkpoint tag: `checkpoint-go-live-full-pass-20260308-0711`
- New checkpoint tag: `checkpoint-go-live-full-pass-20260308-0805`
- New checkpoint tag: `checkpoint-go-live-full-pass-20260308-0911`
- New checkpoint tag: `checkpoint-go-live-full-pass-20260308-0945`
- New checkpoint tag: `checkpoint-go-live-full-pass-20260308-1009`
- New checkpoint tag: `checkpoint-go-live-full-pass-20260308-1225`
- New checkpoint tag: `checkpoint-go-live-full-pass-20260308-1443`
- New checkpoint tag: `checkpoint-go-live-full-pass-20260308-1546`
- New checkpoint tag: `checkpoint-go-live-full-pass-20260308-1614`
- `feat(gate): enforce mandatory log-contract smoke in legacy go_live_gate`
- `feat(gate): tighten full-gate emergency override policy allowlist + metadata validation`
- `fix(smoke): relax de italy-pilot banner expectation in shell smoke`
- `feat(gate): add override-policy smoke script and optional full-gate hook`
- `feat(gate): enable override-policy smoke by default in full go-live gate`
- `feat(obs): add threshold-profile loading + history output for error/storage checks`
- `feat(obs): add 7-day baseline threshold generator (observability_threshold_baseline.sh)`
- `feat(obs): add observability_sample.sh for daily/weekly sampling workflow`
- `ops(obs): cron sampling schedule applied on VPS + logrotate for cron-sample.log validated`
- `ops(obs): cron-path sample write verified via cron log file (manual simulation)`
- `feat(obs): add observability_cron_freshness_check.sh for automated cron recency verification`
- `feat(gate): include observability cron freshness check in full go-live gate`
- `feat(obs): add baseline readiness check and gate weekly baseline refresh on readiness`
- `feat(gate): add baseline readiness step to full go-live gate (non-strict default, strict opt-in)`
- `feat(gate): surface baseline_readiness_state in full-gate summary and emit explicit non-strict WARN`
- Checkpoint tags exist:
  - `checkpoint-go-live-pass`
  - `checkpoint-go-live-pass-20260306-1707`
  - `checkpoint-go-live-pass-ugc-showcase-20260305`

## Active Blockers
- No functional blocker in code/gates right now.
- Staging reliability depends on DNS/Cloudflare state; isolation checks pass only when staging host is reachable and lock-down headers are served.

## Exact Next Steps
1. Run one fresh full verification after any next hardening commit:
   - `GO_LIVE_WITH_BACKUP_VERIFY=true GO_LIVE_WITH_SMTP=true RESET_SMOKE_EMAIL=geovitoworld@gmail.com bash tools/go_live_gate_full.sh`
2. Keep override-policy smoke default ON; only disable for emergency debugging:
   - `GO_LIVE_WITH_OVERRIDE_POLICY_SMOKE=false bash tools/go_live_gate_full.sh`
3. Collect one week of observability history and regenerate baseline:
   - `bash tools/observability_sample.sh` (daily)
   - `bash tools/observability_baseline_readiness.sh`
   - `OBS_SAMPLE_WITH_BASELINE=true bash tools/observability_sample.sh` (weekly)
   - Review `artifacts/observability/threshold-baseline-summary.json`
4. Verify cron recency with dedicated check:
   - `bash tools/observability_cron_freshness_check.sh`
5. After baseline review, run one full gate verification:
   - `GO_LIVE_WITH_BACKUP_VERIFY=true GO_LIVE_WITH_SMTP=true RESET_SMOKE_EMAIL=geovitoworld@gmail.com bash tools/go_live_gate_full.sh`
6. When observability history reaches target coverage, enforce strict baseline readiness in release runs:
   - `GO_LIVE_BASELINE_READINESS_STRICT=true bash tools/go_live_gate_full.sh`

## Critical Non-Negotiables
- Do not break Clean Core: Atlas remains authoritative; UGC remains contributory.
- Do not break SEO/index contracts: Atlas gate unchanged; non-approved UGC must never leak into sitemap/index.
- Do not break dormant guards: import/translation dormant protections and AI OFF defaults stay intact.
- Enforce policies on backend/contracts first; never rely on UI-only controls.
- Keep feature-flag/settings-first rollout discipline.

## Staging / Prod / DNS / Env Notes
- Production frontend: `geovito.com` (Cloudflare Pages).
- Staging frontend: `staging.geovito.com` (CNAME to Pages project, proxied).
- Staging API/CMS endpoint: `cms-staging.geovito.com` (A record to staging VPS, proxied).
- Staging isolation requirements (must stay true):
  - `PUBLIC_SITE_LOCKDOWN_ENABLED=true`
  - `STAGING_SMTP_MODE=mailsink`
  - `STAGING_SMTP_BLOCK_REAL=true`
  - robots + meta noindex enforced.
- Important env reminders:
  - `STRAPI_API_TOKEN` required for `tools/export_ui_locales.sh`.
  - Dashboard owner hints use `PUBLIC_OWNER_EMAILS` (comma-separated) and `PUBLIC_OWNER_EMAIL`.
  - DR/offsite uses R2 + age key material; keep secrets outside repo.

## Last Verified Checks and Gate Status
- Latest full gate evidence file:
  - `artifacts/go-live/go-live-full-20260308T160233Z.txt`
  - Result: PASS for all sections:
    - Core Go-Live Gate
    - Staging Isolation
    - Restore Freshness
    - Kill Switch Smoke
    - Audit Log Smoke
    - SEO Drift Check
    - Error Rate Check
    - Storage Pressure Check
    - Observability Cron Freshness
    - Baseline Readiness Check
    - Override Policy Smoke
- Latest focused checks:
  - `bash tools/shell_smoke_test.sh` -> PASS
  - `GO_LIVE_WITH_BACKUP_VERIFY=true GO_LIVE_WITH_SMTP=true RESET_SMOKE_EMAIL=geovitoworld@gmail.com bash tools/go_live_gate_full.sh` -> PASS
  - `bash tools/observability_sample.sh >> artifacts/observability/cron-sample.log 2>&1` -> PASS
  - latest observability sample evidence: `artifacts/observability/sample-20260308T110116Z.txt`
  - `bash tools/observability_cron_freshness_check.sh` -> PASS
  - latest cron freshness evidence: `artifacts/observability/cron-freshness-last.json`
  - `bash tools/observability_baseline_readiness.sh` -> WARN (expected until >=7 distinct days)
  - latest readiness evidence: `artifacts/observability/baseline-readiness-last.json`
  - `GO_LIVE_BASELINE_READINESS_STRICT=true ... bash tools/go_live_gate_full.sh` -> FAIL (expected contract behavior until readiness=true)
- Repo sync state on last verification:
  - local `main` at `02eaf35`
  - working tree clean.
