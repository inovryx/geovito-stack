# Geovito Release System

## Scope
This document defines the release discipline for `dev -> staging -> production`.

## Environment topology
- `dev`: local development and rapid iteration.
- `staging`: isolated VPS mirror of production.
- `production`: geovito.com + cms.geovito.com.

## Isolation rules (staging)
- Separate DB and storage path/bucket.
- Separate secrets and API tokens.
- Robots always `noindex,nofollow`.
- SMTP runs in `mailsink` mode only.
- External side effects are disabled by default.
- DNS records must exist and resolve for:
  - `staging.geovito.com` (frontend)
  - `cms-staging.geovito.com` (staging API)

Use:
- `bash tools/staging_env_init.sh`
- `bash tools/staging_health.sh`
- `bash tools/staging_isolation_check.sh`

If staging checks fail with DNS resolution, create records first, then rerun the commands above.

## Deployment flow
1. Merge changes to `main`.
2. Deploy and validate on staging first.
3. Run staging checks and smokes.
4. Promote manually to production only after full gate pass.

## Production release gate
Production deployment must pass:
- `bash tools/go_live_gate_full.sh`

Legacy gate remains available:
- `bash tools/go_live_gate.sh`

## Rollback standard
- Keep a known-good tag before risky releases.
- Rollback path:
  1. deploy previous frontend commit
  2. if required, restore backend snapshot via DR scripts
  3. run smoke suite and confirm fingerprint

## Baseline tags
Recommended tag format:
- `checkpoint-hardening-baseline-<UTCSTAMP>`
- `checkpoint-go-live-pass-<UTCSTAMP>`
