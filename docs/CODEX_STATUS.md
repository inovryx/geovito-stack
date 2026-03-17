# CODEX STATUS

Last updated (UTC): 2026-03-17T07:18:15Z
Repo: `/home/ali/geovito-stack`
Branch: `main`
Current head before this status update commit: `be64550`

## Current Project Snapshot
- Core chain is stable and green: Clean Core contracts, Atlas SEO gate, dormant guards, and go-live smoke chain remain intact.
- UGC + Community contracts are active: creator profile, moderation/report flow, follow/preferences/saved-list, dashboard role gates.
- Hardening pack is integrated: staging isolation, DR freshness, kill switch smoke, audit log smoke, SEO drift/error/storage checks.
- Log Foundation v1 is active in dual-write mode: structured contract channels (`app/security/moderation/audit/release/dr`) + legacy domain logs preserved.
- Observability readiness remains strict-ready (`7/7` distinct days + sample floors satisfied).
- Handoff quick file: `docs/RELEASE_HANDOFF.md` (release snapshot + new-session command block).

## Completed Recent Work
- `test(dashboard): stabilize admin lane hash activation assertion` (`frontend/tests/dashboard-activity.spec.ts`)
- `feat(obs): add readiness cron freshness gate check with rotated-log fallback`
- `feat(obs): add readiness watch automation for strict gate transition`
- `feat(obs): add readiness watch transition smoke and gate hook`
- `feat(obs): add cron schedule drift check and gate hook`
- `feat(release): add strict readiness cutover wrapper for post-2026-03-14 runs`
- `fix(gate): use plain docker compose output in pre-design runtime prep`
- `docs(status): sync latest full-gate/observability evidence and strict-readiness window`
- `ops(release): strict readiness cutover executed on 2026-03-14 (second run PASS; first run failed due flaky dashboard UI test)`
- `ops(release): strict full-pass checkpoint tag pushed after cutover`
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-14-1642)`
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-14-1703)`
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-14-1714)`
- `ops(observability): baseline readiness report advanced to 39/39 samples at 2026-03-14T17:14:33Z`

Recent full-pass checkpoints:
- `checkpoint-go-live-full-pass-20260308-1654`
- `checkpoint-go-live-full-pass-20260309-1723`
- `checkpoint-go-live-full-pass-20260314-1615`
- `checkpoint-go-live-full-pass-20260314-1642`
- `checkpoint-go-live-full-pass-20260314-1703`
- `checkpoint-go-live-full-pass-20260314-1714`

## Active Blockers
- No functional blocker in contracts/gates.
- Residual risk: monitor `dashboard_activity_ui_playwright` stability after the nav/hash assertion hardening; targeted suite currently PASS.
- Operational note: `artifacts/go-live/go-live-full-20260314T170253Z.txt` is an override run (`override=true`) and includes failed steps; do not use it as release evidence.

## Exact Next Steps
1. Keep strict mode as release default for full gate:
   - `GO_LIVE_BASELINE_READINESS_STRICT=true GO_LIVE_WITH_BACKUP_VERIFY=true GO_LIVE_WITH_SMTP=true RESET_SMOKE_EMAIL=geovitoworld@gmail.com bash tools/go_live_gate_full.sh`
2. If `Restore Freshness` fails, run `bash tools/restore_smoke.sh` first, then rerun strict full gate.
3. Continue daily cron collection and readiness watch for drift detection.
4. Before next release tag, ensure latest full summary has `override=false` and `baseline_readiness_state=ready`.

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
  - `artifacts/go-live/go-live-full-20260314T170542Z.txt`
  - Result: PASS
  - Includes: Core Gate, Staging Isolation, Restore Freshness, Kill Switch, Audit Log, SEO Drift, Error Rate, Storage Pressure, Observability Cron Schedule, Observability Cron Freshness, Readiness Cron Freshness, Baseline Readiness Check (strict PASS), Readiness Watch Smoke, Override Policy Smoke.
- Latest baseline readiness report:
  - `artifacts/observability/baseline-readiness-last.json`
  - `ready=true`, observed: `error_samples=39`, `storage_samples=39`, `error_distinct_days=7`, `storage_distinct_days=7`.
- Latest cron guard reports:
  - `artifacts/observability/cron-schedule-last.json` -> PASS
  - `artifacts/observability/cron-freshness-last.json` -> PASS
  - `artifacts/observability/readiness-cron-freshness-last.json` -> PASS
- Latest readiness watch state:
  - `artifacts/observability/readiness-watch-state.json` -> `ready=true`, `previous_ready=true`, `transitioned_to_ready=false`, `first_ready_at=2026-03-14T02:30:02.137Z`, latest checked `2026-03-14T16:50:50.331Z`.
- Latest dashboard activity targeted smoke after flake patch:
  - `bash tools/dashboard_activity_ui_playwright.sh`
  - Result: PASS (`12 passed`, `2 skipped`).
- Repo sync:
  - `main` pushed at `d437a26`.
