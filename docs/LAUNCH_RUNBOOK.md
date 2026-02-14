# GeoVito Launch Runbook

This runbook covers safe production activation for tags, analytics, ads, consent flow, and observability.

## 1) Environment Variables (Cloudflare Pages)

Set the following in Cloudflare Pages project environment (Production and Preview as needed).

### Cloudflare Pages Env Checklist (Required)
- `STRAPI_URL` = public/reachable Strapi origin (example: `https://cms.example.com`)
- `PUBLIC_SITE_URL` = canonical site origin (example: `https://www.geovito.com`)
- `ALLOW_LOCALHOST_STRAPI=false` (Pages/production must not allow localhost fallback)
- Keep `STRAPI_URL` out of localhost values in production-like mode (`CF_PAGES=1` or `NODE_ENV=production`), otherwise build fails fast with `STRAPI_URL_GUARD`.
- Optional local smoke override only: `ALLOW_LOCALHOST_STRAPI=true` (do not use on Cloudflare Pages).

### Tags / GTM
- `PUBLIC_TAG_MANAGER` = `none` | `gtm` | `zaraz`
- `PUBLIC_GTM_ID` = `GTM-XXXXXXX`
- `PUBLIC_GTM_LOAD_BEFORE_CONSENT` = `false` (strict default)

### Analytics
- `PUBLIC_ANALYTICS_ENABLED` = `false` (default safe)
- `PUBLIC_ANALYTICS_PROVIDER` = `dataLayer` (recommended with GTM)
- `PUBLIC_ANALYTICS_DEBUG` = `false`

### Ads
- `PUBLIC_ADS_ENABLED` = `false` (default safe)
- `PUBLIC_ADS_SCRIPT_URL` = provider script URL (optional)

### Sentry
- `PUBLIC_SENTRY_ENABLED` = `false` (default safe)
- `PUBLIC_SENTRY_DSN` = your browser DSN
- `PUBLIC_SENTRY_ENV` = `production`
- `PUBLIC_SENTRY_RELEASE` = optional; if empty, app falls back to build SHA
- `PUBLIC_SENTRY_TRACES_SAMPLE_RATE` = `0` (start low)

### Ops utility pages
- `PUBLIC_OPS_ENABLED` = `false` in production (recommended)
- `PUBLIC_OPS_MODE` = `local`
- `PUBLIC_OPS_FIXTURE_PATH` = optional test-only path

### Optional build metadata
- `PUBLIC_BUILD_SHA` = optional override

Notes:
- On Cloudflare Pages, `CF_PAGES_COMMIT_SHA` and `CF_PAGES_BRANCH` are auto-read by the app and exposed as non-secret HTML dataset attributes.
- Never place secrets into public env vars.

## 2) Post-deploy Smoke Checklist (10 min)

1. Build/deploy sanity:
   - Cloudflare Pages build must complete without `STRAPI_URL_GUARD` error.
   - Verify `STRAPI_URL` and `PUBLIC_SITE_URL` are set in both Production and Preview.

2. Home and shell:
   - `/en/` loads and core shell renders.
   - Theme toggle works and persists after refresh (no flash regression).

3. Consent and tags gating:
   - First visit shows consent banner.
   - In strict mode (`PUBLIC_GTM_LOAD_BEFORE_CONSENT=false`), GTM stays blocked before consent.
   - Reject all keeps analytics/ads blocked.

4. Ops pages:
   - With `PUBLIC_OPS_ENABLED=false`, `/en/ops/status/` redirects away (not discoverable).
   - If temporarily enabled, `/en/ops/*` remains `noindex,nofollow`.

5. Sitemap and index gate:
   - `/sitemap.xml` responds.
   - Confirm no mock/non-complete Atlas URLs are included.
   - Non-indexable pages keep expected robots/canonical behavior.
6. Post-deploy script:
   - `bash tools/post_deploy_smoke.sh BASE_URL=https://your-deploy-url`
   - Optional ops enforcement: `OPS_REQUIRED=1 bash tools/post_deploy_smoke.sh BASE_URL=https://your-deploy-url`
   - Expected: all PASS lines, exit 0.

## 3) Go-Live Verification Steps

1. First visit without stored consent:
   - Consent banner is visible.
   - In strict mode (`PUBLIC_GTM_LOAD_BEFORE_CONSENT=false`), GTM script is not loaded.

2. Reject all:
   - GTM script remains blocked.
   - Analytics events are not recorded.
   - Ads script is not loaded.

3. Accept analytics only:
   - GTM can load under strict policy (analytics granted).
   - Analytics events flow through configured provider.
   - Ads remain off.

4. Accept ads:
   - Ads script loads only after ads consent.
   - AdSlot containers keep reserved size; no CLS from empty/late ads.

5. Sentry check (staging first):
   - With analytics consent ON, trigger a test client error.
   - Confirm event appears in Sentry with sanitized payload.

6. Noindex checks:
   - `/[lang]/error` returns `robots: noindex,nofollow`.
   - `/[lang]/ops/*` utility pages are noindex and env-gated.

## 4) Rollback

If launch quality is not acceptable:

1. Set these to safe off:
   - `PUBLIC_ANALYTICS_ENABLED=false`
   - `PUBLIC_ADS_ENABLED=false`
   - `PUBLIC_SENTRY_ENABLED=false`
   - `PUBLIC_TAG_MANAGER=none`

2. Trigger redeploy (commit or manual redeploy in Cloudflare Pages).
3. Re-verify:
   - Consent banner behavior
   - GTM and ads scripts blocked
   - Site core flows intact

## 5) Ops Status Quick Check

When temporarily enabled (`PUBLIC_OPS_ENABLED=true`), visit:
- `/{lang}/ops/status/`

Confirm:
- Build SHA/branch are visible
- Consent client state reflects current choice
- GTM ID is redacted (not full value)
- No secrets (DSN/tokens/keys) appear

## 6) VPS without Node (Docker-first workflow)

If your VPS does not have Node/Corepack installed, run frontend tests and gates via Docker wrappers:

```bash
chmod +x tools/frontend_test_docker.sh tools/frontend_gate_docker.sh
./tools/frontend_test_docker.sh
./tools/frontend_gate_docker.sh
```

Post-deploy smoke (no Node required):

```bash
chmod +x tools/post_deploy_smoke.sh
BASE_URL=https://www.geovito.com bash tools/post_deploy_smoke.sh
```

Why `--network=host` is required:
- Strapi is bound to host loopback (`127.0.0.1:1337`).
- Playwright runs inside a container; with host network it can reach host loopback safely.

Permissions footgun note:
- If `frontend/node_modules` or `frontend/dist*` become root-owned, the dockerized pnpm/playwright run can fail with `EACCES`.
- `tools/frontend_test_docker.sh` detects this and exits with a copy/paste fix command.

Cloudflare Pages env reminder:
- Always set `STRAPI_URL` to a reachable CMS origin in Production/Preview.
- Guard behavior: in production-like mode (`CF_PAGES=1` or `NODE_ENV=production`), localhost Strapi URL is blocked by `STRAPI_URL_GUARD`.
- `ALLOW_LOCALHOST_STRAPI=true` is only for intentional local smoke runs, not Cloudflare Pages deployments.
