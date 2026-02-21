# GeoVito Launch Runbook

This runbook covers safe production activation for tags, analytics, ads, consent flow, and observability.

## 1) Environment Variables (Cloudflare Pages)

Set the following in Cloudflare Pages project environment (Production and Preview as needed).

### Cloudflare Pages Env Checklist (Required)
- `STRAPI_URL` = public/reachable Strapi origin (example: `https://cms.example.com`)
- `PUBLIC_SITE_URL` = canonical site origin (example: `https://www.geovito.com`)
- `ALLOW_LOCALHOST_STRAPI=false` (Pages/production must not allow localhost fallback)
- `PUBLIC_SITE_LOCKDOWN_ENABLED=false` (test-only private mode icin `true`)
- `PUBLIC_SITE_LOCKDOWN_NOTICE` = optional test-mode warning text
- `PUBLIC_AUTH_LOCAL_REGISTER_ENABLED=true|false` (default true)
- `PUBLIC_AUTH_GOOGLE_ENABLED=false` (default)
- `PUBLIC_AUTH_FACEBOOK_ENABLED=false` (default)
- `PUBLIC_TURNSTILE_SITE_KEY` (optional; set to enable captcha widget on auth forms)
- If `STRAPI_URL` is protected by Cloudflare Access, also set:
  - `CF_ACCESS_CLIENT_ID`
  - `CF_ACCESS_CLIENT_SECRET`
- Keep `STRAPI_URL` out of localhost values in production-like mode (`CF_PAGES=1` or `NODE_ENV=production`), otherwise build fails fast with `STRAPI_URL_GUARD`.
- Optional local smoke override only: `ALLOW_LOCALHOST_STRAPI=true` (do not use on Cloudflare Pages).
- If build logs show `Unexpected token '<' ... not valid JSON`, `STRAPI_URL` is likely returning an HTML Access/login page; configure the two `CF_ACCESS_*` variables above.

Strapi runtime auth flags (VPS/docker):
- `AUTH_LOCAL_REGISTER_ENABLED=true|false`
- `AUTH_GOOGLE_ENABLED=true|false`
- `AUTH_FACEBOOK_ENABLED=true|false`
- `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET` (required if Google enabled)
- `AUTH_FACEBOOK_CLIENT_ID`, `AUTH_FACEBOOK_CLIENT_SECRET` (required if Facebook enabled)
- `AUTH_GOOGLE_CALLBACK_PATH`, `AUTH_FACEBOOK_CALLBACK_PATH` (optional override)
- `AUTH_GOOGLE_SCOPE`, `AUTH_FACEBOOK_SCOPE` (optional, comma-separated)
- `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX`
- `TURNSTILE_ENABLED=true|false` (default false)
- `TURNSTILE_SECRET_KEY` (required only when `TURNSTILE_ENABLED=true`)

Strapi runtime email flags (VPS/docker):
- `EMAIL_PROVIDER=sendmail|nodemailer` (production SMTP icin `nodemailer`)
- `EMAIL_DEFAULT_FROM`, `EMAIL_DEFAULT_REPLY_TO`
- `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`
- `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`
- `EMAIL_SMTP_SECURE`, `EMAIL_SMTP_REQUIRE_TLS`, `EMAIL_SMTP_IGNORE_TLS`

Strapi runtime media flags (VPS/docker):
- `MEDIA_IMAGE_CONVERT_ENABLED=true`
- `MEDIA_IMAGE_TARGET_FORMAT=webp` (policy)
- `MEDIA_IMAGE_ALLOWED_INPUT_MIME=jpg,jpeg,png,webp`
- `MEDIA_IMAGE_QUALITY` (suggested `80-85`)
- `MEDIA_IMAGE_MAX_INPUT_BYTES`, `UPLOAD_MAX_FILE_SIZE_BYTES`

UI locale build-time export:
- `ui-locale` edits require export + deploy.
- `deploy_required=true` indicates pending deploy.
- Local token file (repo disi):
  - `bash tools/ui_locale_secret_init.sh`
  - `~/.config/geovito/ui_locale.env` icine `STRAPI_API_TOKEN` yaz
  - Not: `ui_locale_publish.sh` ve `ui_locale_sync.sh` bu dosya yoksa template olusturup durur.
- Operational commands:
  - `bash tools/ui_locale_publish.sh` (export + build check)
  - `bash tools/ui_locale_sync.sh` (import + export + build check)

If social login is enabled:
- Apply provider configuration from env to Strapi store:
  - `bash tools/oauth_provider_apply.sh --dry-run`
  - `bash tools/oauth_provider_apply.sh`
  - `.env` degistirdiysen: `REFRESH_STRAPI_ENV=1 bash tools/oauth_provider_apply.sh --dry-run`
- Set exact callback URLs for your domain:
  - `https://geovito.com/api/connect/google/callback`
  - `https://geovito.com/api/connect/facebook/callback`
  - include `https://www.geovito.com/...` variant only if you still serve `www`.

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

### Optional build metadata
- `PUBLIC_BUILD_SHA` = optional override

Notes:
- On Cloudflare Pages, `CF_PAGES_COMMIT_SHA` and `CF_PAGES_BRANCH` are auto-read by the app and exposed as non-secret HTML dataset attributes.
- Never place secrets into public env vars.

## Cloudflare Pages Preflight

Cloudflare tarafina gitmeden once VPS/yerel ortamda tek komutla ayni sinif build hatalarini yakalamak icin:

```bash
bash tools/update_lockfile.sh
bash tools/pages_preflight.sh
```

Dependency degisikligi varsa sira her zaman su olmali:
1. `bash tools/update_lockfile.sh`
2. `bash tools/pages_preflight.sh`
3. commit + push

Not:
- Cloudflare Pages build tarafinda `--no-frozen-lockfile` gibi hatayi gizleyen bayraklar kullanma.
- Lockfile disiplini korunmali (`frontend/pnpm-lock.yaml` source of truth).
- Yerelde localhost Strapi ile test gerekiyorsa:
  `ALLOW_LOCALHOST_STRAPI=true STRAPI_URL=http://127.0.0.1:1337 bash tools/pages_preflight.sh`

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

4. Sitemap and index gate:
   - `/sitemap.xml` responds.
   - Confirm no mock/non-complete Atlas URLs are included.
   - Non-indexable pages keep expected robots/canonical behavior.
5. Build Fingerprint:
   - `/.well-known/geovito-build.json` responds with `build_sha7`, `build_branch`, `build_time_utc`.
   - Use this endpoint to confirm the expected deploy SHA quickly.
6. Post-deploy script:
   - `BASE_URL=https://your-deploy-url bash tools/post_deploy_smoke.sh`
   - Optional SHA pin:
     `BASE_URL=https://your-deploy-url EXPECTED_SHA7=xxxxxxx bash tools/post_deploy_smoke.sh`
   - If Cloudflare Access is enabled:
     `CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... BASE_URL=https://your-deploy-url bash tools/post_deploy_smoke.sh`
   - Expected: all PASS lines, exit 0.
7. Media policy guard:
   - `bash tools/media_policy_check.sh`
   - Expected: WebP conversion policy PASS + default OG JPEG exists.
8. Auth flow guard:
   - `bash tools/auth_flow_check.sh`
   - Expected: PASS for register/login/forgot(200)/reset-invalid(400)/provider checks according to active env flags.
9. OAuth config guard (when enabling social login):
   - `PUBLIC_SITE_URL=https://geovito.com bash tools/oauth_config_check.sh`
   - Expected:
     - Provider OFF -> skipped + PASS
     - Provider ON -> `/api/connect/{provider}` returns redirect with correct provider host + callback URL
10. SMTP config guard (when enabling password reset emails):
    - `bash tools/smtp_config_check.sh`
    - Expected:
      - `EMAIL_PROVIDER=sendmail` -> PASS with warning (SMTP disabled).
      - `EMAIL_PROVIDER=nodemailer` -> required SMTP vars + TCP reachability PASS.
11. Password reset smoke:
    - `RESET_SMOKE_EMAIL=you@example.com bash tools/password_reset_smoke.sh`
    - Expected:
      - forgot-password -> `200`
      - reset-password invalid token -> `400`
      - inbox/spam receives reset mail when SMTP is correctly configured.

## 2.1) One-command Release (deploy + smoke + optional checks)

- Standard:
  - `bash tools/release_deploy_smoke.sh`
- Include moderation stale-pending guard:
  - `bash tools/release_deploy_smoke.sh --with-moderation`
- Include account comment queue Playwright smoke:
  - `bash tools/release_deploy_smoke.sh --with-account-test`
- Include blog engagement Playwright smoke (auto-seed blog mock data when missing):
  - `bash tools/release_deploy_smoke.sh --with-blog-engagement-test`
- Include bulk moderation action (oldest pending N comments):
  - `COMMENT_BULK_ACTION=approve-next-bulk COMMENT_BULK_LIMIT=10 bash tools/release_deploy_smoke.sh --with-comment-bulk-action`
- Include both optional checks:
  - `bash tools/release_deploy_smoke.sh --with-moderation --with-account-test`
- Include all optional checks:
  - `bash tools/release_deploy_smoke.sh --with-moderation --with-account-test --with-blog-engagement-test`

Notes:
- `--with-account-test` runs `bash tools/account_comment_queue_test.sh`.
- The account test uses Docker Playwright and requires writable `frontend/node_modules` ownership.
- `--with-blog-engagement-test` runs `bash tools/blog_engagement_ui_playwright.sh`.
- `--with-comment-bulk-action` requires:
  - `COMMENT_BULK_ACTION` in `approve-next-bulk|reject-next-bulk|spam-next-bulk|delete-next-bulk`
  - optional `COMMENT_BULK_LIMIT` (default `10`) and `COMMENT_BULK_NOTES`.

Pre-design gate icinde blog engagement UI adimini da kosmak istersen:
- `RUN_BLOG_ENGAGEMENT_UI_GATE=true bash tools/pre_design_gate_check.sh`

Pre-design gate icinde bulk yorum moderasyon aksiyonu kosmak istersen:
- `RUN_COMMENT_BULK_GATE=true COMMENT_BULK_ACTION=approve-next-bulk COMMENT_BULK_LIMIT=10 COMMENT_BULK_NOTES="pre-design bulk" bash tools/pre_design_gate_check.sh`

## 3) Test Mode Protection (Recommended for closed testing)

If you want to avoid accidental public usage during test phase:

1. Set Pages env:
   - `PUBLIC_SITE_LOCKDOWN_ENABLED=true`
   - optional: `PUBLIC_SITE_LOCKDOWN_NOTICE=Private QA mode is active`
2. Redeploy Pages.
3. Result:
   - All pages force `robots=noindex,nofollow`
   - Visible test-mode banner appears
   - Register/social auth entry points are hidden in UI
4. For strict access control, also enable Cloudflare Access (email allowlist/OTP) in front of the site.

When Access is active, use Service Token headers for automation scripts:
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`
- These values are secret. Keep them only in VPS shell env, never commit to repo.

## 4) Go-Live Verification Steps

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

## 5) Rollback

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

## 6) VPS without Node (Docker-first workflow)

If your VPS does not have Node/Corepack installed, run frontend tests and gates via Docker wrappers:

```bash
chmod +x tools/frontend_test_docker.sh tools/frontend_gate_docker.sh
./tools/frontend_test_docker.sh
./tools/frontend_gate_docker.sh
```

`tools/frontend_test_docker.sh` now prepares deterministic search fixtures before Playwright:
- clears and re-seeds mock dataset (`ALLOW_MOCK_SEED=true` internally)
- verifies required slugs: `united-states`, `new-york-city`, `berlin`

Optional override:
```bash
SKIP_MOCK_SEED=1 ./tools/frontend_test_docker.sh
```
Use this only when you intentionally want to keep current runtime data.

Post-deploy smoke (no Node required):

```bash
chmod +x tools/post_deploy_smoke.sh
BASE_URL=https://www.geovito.com bash tools/post_deploy_smoke.sh
```

Cloudflare Access acikken gunluk smoke (onerilen tek komut):

```bash
chmod +x tools/smoke_access.sh
CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... bash tools/smoke_access.sh
```

Tokenlari her seferinde yazmamak icin (onerilen):

```bash
bash tools/smoke_access_env_init.sh
nano ~/.config/geovito/smoke_access.env
bash tools/smoke_access.sh
```

Not:
- `~/.config/geovito/smoke_access.env` dosyasi local kalir, repoya girmez.
- Dosya izinleri `600` olmalidir.

Opsiyonel:
- Farkli domain icin: `BASE_URL=https://geovito-stack.pages.dev bash tools/smoke_access.sh`
- SHA override icin: `EXPECTED_SHA7=abcdef1 bash tools/smoke_access.sh`

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

## 7) Operations / Health Checks

Backend health endpoint:
- Route: `GET /api/_health`
- Success body: `{ "ok": true, "db": true }`
- Access policy:
  - Allowed from localhost (`127.0.0.1` / `::1`) by default.
  - Optional remote override with header `x-health-token` when `HEALTH_TOKEN` env is set on Strapi.
- This endpoint should stay behind localhost bind/firewall/Nginx controls.

Single-command stack check on VPS:

```bash
bash tools/stack_health.sh
```

Optional token usage:

```bash
HEALTH_TOKEN=your_health_token bash tools/stack_health.sh
```

What it verifies:
- `db` and `strapi` containers are running/healthy.
- Strapi `GET /api/_health` returns `200` and `ok=true, db=true`.
