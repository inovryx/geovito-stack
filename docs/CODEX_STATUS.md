# CODEX STATUS

Last updated (UTC): 2026-03-09T17:48:21Z
Repo: `/home/ali/geovito-stack`
Branch: `main`
Current head: `0987a0b`

## Current Project Snapshot
- Core chain is stable and green: Clean Core contracts, Atlas SEO gate, dormant guards, and go-live smoke chain remain intact.
- UGC + Community contracts are active: creator profile, moderation/report flow, follow/preferences/saved-list, dashboard role gates.
- Hardening pack is integrated: staging isolation, DR freshness, kill switch smoke, audit log smoke, SEO drift/error/storage checks.
- Log Foundation v1 is active in dual-write mode: structured contract channels (`app/security/moderation/audit/release/dr`) + legacy domain logs preserved.
- Observability rollout is in pre-strict phase: cron schedule/freshness checks are enforced; baseline readiness is still `not_ready` because distinct-day history is not yet 7/7.

## Completed Recent Work
- `feat(obs): add readiness cron freshness gate check with rotated-log fallback`
- `feat(obs): add readiness watch automation for strict gate transition`
- `feat(obs): add readiness watch transition smoke and gate hook`
- `feat(obs): add cron schedule drift check and gate hook`
- `docs(status): sync latest full-gate/observability evidence and strict-readiness window`

Recent full-pass checkpoints:
- `checkpoint-go-live-full-pass-20260308-1654`
- `checkpoint-go-live-full-pass-20260309-1723`

## Active Blockers
- No functional blocker in code/gates.
- Strict baseline enforcement is intentionally blocked until enough day coverage is accumulated.
  - Current deficits from latest readiness report: `error_distinct_days=5`, `storage_distinct_days=5`.

## Exact Next Steps
1. Keep daily cron collection running without changing strict mode before 2026-03-14.
   - `10 2 * * * ... tools/observability_sample.sh`
   - `20 2 * * 1 ... OBS_SAMPLE_WITH_BASELINE=true tools/observability_sample.sh`
   - `30 2 * * * ... tools/observability_readiness_watch.sh`
2. Continue non-strict full verification after hardening commits:
   - `GO_LIVE_WITH_BACKUP_VERIFY=true GO_LIVE_WITH_SMTP=true RESET_SMOKE_EMAIL=geovitoworld@gmail.com bash tools/go_live_gate_full.sh`
3. On/after 2026-03-14 02:10 UTC, attempt strict baseline enforcement:
   - `GO_LIVE_BASELINE_READINESS_STRICT=true GO_LIVE_WITH_BACKUP_VERIFY=true GO_LIVE_WITH_SMTP=true RESET_SMOKE_EMAIL=geovitoworld@gmail.com bash tools/go_live_gate_full.sh`
4. If strict full gate passes, create/push new checkpoint tag.

## Critical Non-Negotiables
- Atlas stays authoritative; UGC stays contributory.
- Atlas SEO/index gate must remain strict; non-approved UGC must never leak into sitemap/index.
- Dormant guards remain dormant by default (import/translation/AI).
- Backend-enforced policies first; UI cannot be authority.
- Feature-flag/settings-first rollout discipline stays mandatory.

## Staging / Prod / DNS / Env Notes
- Production frontend: `geovito.com` (Cloudflare Pages).
- Staging frontend: `staging.geovito.com` (CNAME -> `geovito-stack.pages.dev`, proxied).
- Staging CMS/API: `cms-staging.geovito.com` (A -> staging VPS, proxied).
- Staging isolation requirements (must stay true):
  - `PUBLIC_SITE_LOCKDOWN_ENABLED=true`
  - `STAGING_SMTP_MODE=mailsink`
  - `STAGING_SMTP_BLOCK_REAL=true`
  - robots + meta noindex enforced.

## Last Verified Checks and Gate Status
- Latest successful full gate evidence:
  - `artifacts/go-live/go-live-full-20260309T172824Z.txt`
  - Result: PASS
  - Includes: Core Gate, Staging Isolation, Restore Freshness, Kill Switch, Audit Log, SEO Drift, Error Rate, Storage Pressure, Observability Cron Schedule, Observability Cron Freshness, Readiness Cron Freshness, Baseline Readiness Check (non-strict), Readiness Watch Smoke, Override Policy Smoke.
- Latest baseline readiness report:
  - `artifacts/observability/baseline-readiness-last.json`
  - `ready=false`, observed: `error_samples=27`, `storage_samples=27`, `error_distinct_days=2`, `storage_distinct_days=2`.
- Latest cron guard reports:
  - `artifacts/observability/cron-schedule-last.json` -> PASS
  - `artifacts/observability/cron-freshness-last.json` -> PASS
  - `artifacts/observability/readiness-cron-freshness-last.json` -> PASS
- Latest readiness watch state:
  - `artifacts/observability/readiness-watch-state.json` -> `ready=false`, `transitioned_to_ready=false`.
- Repo sync:
  - `main` pushed at `0987a0b`.
