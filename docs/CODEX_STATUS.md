# CODEX STATUS

Last updated (UTC): 2026-03-18T07:48:19Z
Repo: `/home/ali/geovito-stack`
Branch: `main`
Current head before this status update commit: `253c746`

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
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-17-0749)`
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-17-0807)`
- `fix(dashboard): resync section nav after hash listener bind` (`198b90c`)
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-17-0858)`
- `docs(release): refresh status and handoff after latest strict pass` (`52e8260`)
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-17-0914)`
- `docs(release): sync status after strict full pass and checkpoint` (`78a98a8`)
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-17-0919)`
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-17-0936)`
- `feat(obs): add consolidated observability trend report script` (`b6dcd0b`)
- `docs(obs): record trend-report automation and latest status` (`7fbc424`)
- `docs(obs): record trend logrotate verification` (`0d76a75`)
- `feat(obs): add trend freshness check and full-gate hook`
- `ops(release): checkpoint tag pushed (2026-03-17-0938)`
- `ops(release): checkpoint tag pushed (2026-03-17-1001)`
- `ops(release): checkpoint tag pushed (2026-03-17-1005)`
- `ops(release): checkpoint tag pushed (2026-03-17-1034)`
- `ops(release): checkpoint tag pushed (2026-03-17-1105)`
- `ops(release): checkpoint tag pushed (2026-03-17-1109)`
- `ops(release): checkpoint tag pushed (2026-03-17-1206)`
- `ops(release): checkpoint tag pushed (2026-03-17-1210)`
- `ops(release): checkpoint tag pushed (2026-03-17-1213)`
- `ops(release): checkpoint tag pushed (2026-03-17-1221)`
- `ops(release): strict full gate rerun PASS with trend freshness step (run_id=gv-run-20260317T102121Z-31881)`
- `ops(release): strict full gate rerun PASS (run_id=gv-run-20260317T105604Z-16051)`
- `ops(observability): strict readiness re-validated at 2026-03-17T08:07:42Z`
- `ops(observability): cron freshness + readiness watch manual validation PASS at 2026-03-17T08:09Z`
- `ops(observability): readiness watch refreshed -> READY at 2026-03-17T09:00:48Z`
- `ops(observability): readiness watch refreshed -> READY at 2026-03-17T09:15:10Z`
- `ops(observability): readiness watch refreshed -> READY at 2026-03-17T09:36:49Z`
- `ops(observability): trend report cron scheduled at 02:40 UTC`
- `ops(observability): trend report run PASS at 2026-03-17T09:54:36Z`
- `ops(observability): trend logrotate verified (daily, rotate 14, compress)`
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-17-1844)`
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-17-1903)`
- `feat(gate): baseline readiness strict default enabled in full gate`
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-17-1928)`
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-17-1954)`
- `feat(dr): add weekly restore cycle and cron schedule check` (`4a33915`)
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-17-2021)`
- `fix(dr): reset staging schema before restore import` (`002bbb1`)
- `fix(dr): avoid deleting uploads mount point during restore` (`67be87f`)
- `fix(dr): use GV_LOG_RUN_ID in weekly restore report` (`1a0b196`)
- `fix(dr): ignore non-snapshot dirs when selecting latest backup` (`253c746`)
- `ops(release): strict full gate rerun PASS + checkpoint tag pushed (2026-03-18-0748)`

Recent full-pass checkpoints:
- `checkpoint-go-live-full-pass-20260308-1654`
- `checkpoint-go-live-full-pass-20260309-1723`
- `checkpoint-go-live-full-pass-20260314-1615`
- `checkpoint-go-live-full-pass-20260314-1642`
- `checkpoint-go-live-full-pass-20260314-1703`
- `checkpoint-go-live-full-pass-20260314-1714`
- `checkpoint-go-live-full-pass-20260317-0749`
- `checkpoint-go-live-full-pass-20260317-0807`
- `checkpoint-go-live-full-pass-20260317-0858`
- `checkpoint-go-live-full-pass-20260317-0914`
- `checkpoint-go-live-full-pass-20260317-0919`
- `checkpoint-go-live-full-pass-20260317-0936`
- `checkpoint-go-live-full-pass-20260317-0938`
- `checkpoint-go-live-full-pass-20260317-1001`
- `checkpoint-go-live-full-pass-20260317-1005`
- `checkpoint-go-live-full-pass-20260317-1034`
- `checkpoint-go-live-full-pass-20260317-1105`
- `checkpoint-go-live-full-pass-20260317-1109`
- `checkpoint-go-live-full-pass-20260317-1206`
- `checkpoint-go-live-full-pass-20260317-1210`
- `checkpoint-go-live-full-pass-20260317-1213`
- `checkpoint-go-live-full-pass-20260317-1221`
- `checkpoint-go-live-full-pass-20260317-1844`
- `checkpoint-go-live-full-pass-20260317-1903`
- `checkpoint-go-live-full-pass-20260317-1928`
- `checkpoint-go-live-full-pass-20260317-1954`
- `checkpoint-go-live-full-pass-20260317-2021`
- `checkpoint-go-live-full-pass-20260318-0748`

## Active Blockers
- No functional blocker in contracts/gates.
- Residual risk: keep monitoring `dashboard_activity_ui_playwright` for intermittent browser timing flakes.
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
  - `artifacts/go-live/go-live-full-20260318T073621Z.txt`
  - Result: PASS
  - Includes: Core Gate, Release Docs Sync Check, Staging Isolation, Restore Freshness, DR Cron Schedule, Kill Switch, Audit Log, SEO Drift, Error Rate, Storage Pressure, Observability Cron Schedule, Observability Cron Freshness, Readiness Cron Freshness, Observability Trend Freshness, Baseline Readiness Check, Readiness Watch Smoke, Override Policy Smoke.
- Latest baseline readiness report:
  - `artifacts/observability/baseline-readiness-last.json`
  - `ready=true`, observed: `error_samples=31`, `storage_samples=31`, `error_distinct_days=7`, `storage_distinct_days=7`.
- Latest cron guard reports:
  - `artifacts/observability/cron-schedule-last.json` -> PASS
  - `artifacts/observability/cron-freshness-last.json` -> PASS
  - `artifacts/observability/readiness-cron-freshness-last.json` -> PASS
  - `artifacts/observability/trend-freshness-last.json` -> PASS
  - `artifacts/dr/cron-schedule-last.json` -> PASS
- Latest observability trend report:
  - `artifacts/observability/trend-report-last.txt` -> `OVERALL=PASS`
  - `artifacts/observability/trend-report-last.json` -> `status.all_green=true`
- Latest trend log rotation check:
  - `/etc/logrotate.d/geovito-observability-trend` active
  - test rotate produced `artifacts/observability/cron-trend.log.1` and reset `artifacts/observability/cron-trend.log`
- Latest readiness watch state:
  - `artifacts/observability/readiness-watch-state.json` -> `ready=true`, `previous_ready=true`, `transitioned_to_ready=false`, `first_ready_at=2026-03-14T02:30:02.137Z`, latest checked `2026-03-18T02:30:02.029Z`.
- Latest dashboard activity targeted smoke after flake patch:
  - `bash tools/dashboard_activity_ui_playwright.sh`
  - Result: PASS (`12 passed`, `2 skipped`).
- Repo sync:
  - `main` pushed at `253c746`.
