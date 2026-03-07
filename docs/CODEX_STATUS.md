# CODEX STATUS

Last updated (UTC): 2026-03-07T20:26:00Z
Repo: `/home/ali/geovito-stack`
Branch: `main`
Head: `bb0bb00`

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
- `test(logging): add log contract smoke and optional gate hook`
- Pending commit in working tree:
  - `fix(gates): stabilize shell smoke banner expectations and tighten moderation error-rate counting`
  - `fix(logging): fallback to artifacts log root when logs/channels is not writable`
- Checkpoint tags exist:
  - `checkpoint-go-live-pass`
  - `checkpoint-go-live-pass-20260306-1707`
  - `checkpoint-go-live-pass-ugc-showcase-20260305`

## Active Blockers
- No functional blocker in code/gates right now.
- Operational watchpoint: VPS `logs/channels` is root-owned in current host state; contract logger now auto-falls back to `artifacts/logs/channels`, but ownership normalization is still recommended.
- Staging reliability depends on DNS/Cloudflare state; isolation checks pass only when staging host is reachable and lock-down headers are served.

## Exact Next Steps
1. Commit and push current working-tree fixes:
   - `git add tools/error_rate_check.sh tools/lib_log_contract.sh tools/shell_smoke_test.sh docs/CODEX_STATUS.md`
   - `git commit -m "fix(gates): stabilize shell smoke expectations and tighten moderation error-rate checks"`
   - `git push origin main`
2. Tag post-fix checkpoint:
   - `git tag -a checkpoint-go-live-full-pass-$(date -u +%Y%m%d-%H%M) -m "Go-live full gate pass"`
   - `git push origin --tags`
3. Optional host cleanup (recommended): normalize VPS log dir ownership when sudo access is available:
   - `cd /home/ali/geovito-stack && sudo chown -R ali:ali logs artifacts`
4. Next hardening increment: make log-contract smoke mandatory in full gate (remove opt-in behavior).

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
  - `artifacts/go-live/go-live-full-20260307T201536Z.txt`
  - Result: PASS for all sections:
    - Core Go-Live Gate
    - Staging Isolation
    - Restore Freshness
    - Kill Switch Smoke
    - Audit Log Smoke
    - SEO Drift Check
    - Error Rate Check
    - Storage Pressure Check
- Latest focused checks:
  - `bash tools/shell_smoke_test.sh` -> PASS
  - `GO_LIVE_WITH_BACKUP_VERIFY=true GO_LIVE_WITH_SMTP=true GO_LIVE_WITH_LOG_CONTRACT_SMOKE=true RESET_SMOKE_EMAIL=geovitoworld@gmail.com bash tools/go_live_gate_full.sh` -> PASS
- Repo sync state on last verification:
  - local `main` at `bb0bb00`
  - working tree includes pending fix files (not committed yet).
