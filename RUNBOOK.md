# Geovito Stack Runbook (Clean Rebuild)

## Stack
- Strapi (Docker) + Postgres
- Astro frontend (Cloudflare Pages target)
- Import execution: disabled (dormant contract mode)
- Repo mode: PROD-FIRST (single live standard)
- Ops routes intentionally removed (`/[lang]/ops/*` not part of active baseline)
- Build fingerprint endpoint active: `/.well-known/geovito-build.json`
- Media policy active: `webp-first` content + `jpeg` OG fallback (`MEDIA_SYSTEM.md`)

## Start / Stop
```bash
cd /home/ali/geovito-stack
bash tools/prod_up.sh
bash tools/prod_down.sh
```

## Rebuild
```bash
cd /home/ali/geovito-stack
docker compose up -d --build
```

## Health
```bash
cd /home/ali/geovito-stack
docker compose ps
curl -I http://127.0.0.1:1337/admin
bash tools/prod_health.sh
bash tools/stack_health.sh
```

`tools/stack_health.sh` checks:
- docker `db` and `strapi` runtime/health
- `GET /api/_health` response contract (`ok=true`, `db=true`)

## Media Upload Smoke (Optional)
Requires an admin-level Strapi API token with upload permissions.

First-time secret setup:
```bash
cd /home/ali/geovito-stack
bash tools/media_smoke_env_init.sh
nano ~/.config/geovito/media_smoke.env
```

Run with saved secret:
```bash
cd /home/ali/geovito-stack
bash tools/media_smoke.sh
```

Alternative one-shot:
```bash
cd /home/ali/geovito-stack
STRAPI_API_TOKEN=... bash tools/media_upload_smoke.sh
```

This uploads a tiny fixture image and verifies it is converted to WebP.
If token is missing, `tools/pre_design_gate_check.sh` marks this step as `SKIP` and continues.

## Shell Readiness (One Command)
```bash
cd /home/ali/geovito-stack
bash tools/shell_smoke_test.sh
```

What it verifies:
- Atlas hierarchy routes (country/city/district/poi)
- Blog list + detail routes
- Account + dashboard shell routes
- robots/canonical/banner markers
- pilot indexable route + fallback route
- unknown slug 404 behavior
- writes URL-level report to `artifacts/shell_smoke_report.tsv`

## Account Language Preference (Authenticated)
- Endpoint: `GET /api/user-preferences/me`, `PUT /api/user-preferences/me`
- Purpose: persist preferred site UI language per user profile.
- Atlas content language remains independent; if requested UI locale is missing in Atlas translations, frontend falls back to EN content.

## Cloudflare Pages Build Gate
```bash
cd /home/ali/geovito-stack
bash tools/pages_build_check.sh
```

Canonical Pages build command:
```bash
npm ci && npm run i18n:check && npm run build
```
Root directory: `frontend`
Output: `dist`
Node: `20`

## UI Language Import/Export (Build-time)
First-time setup (one-time):
```bash
bash tools/ui_locale_secret_init.sh
nano ~/.config/geovito/ui_locale.env
```

`~/.config/geovito/ui_locale.env` content:
```bash
STRAPI_API_TOKEN='your_real_token_here'
```

Main flows:
```bash
# only import artifacts/ui-locales/*.json -> Strapi
bash tools/import_ui_locales.sh

# only export Strapi -> frontend/src/i18n + clear deploy_required
# also writes artifacts/ui-locale-progress.json
bash tools/export_ui_locales.sh

# print translation gap summary (missing/untranslated per locale)
bash tools/ui_locale_progress_report.sh

# export + Cloudflare-compatible build check
bash tools/ui_locale_publish.sh
# optional: skip ui-page progress report
bash tools/ui_locale_publish.sh --no-ui-page-report

# import + export + build check (one command)
bash tools/ui_locale_sync.sh
```

Notes:
- `ui-locale.deploy_required=true` means a deploy is needed.
- Export clears `deploy_required` and updates `last_exported_at`.
- Import/export recomputes per-locale progress:
  - `total_keys`, `translated_keys`, `missing_keys`, `untranslated_keys`, `coverage_percent`
  - `missing_examples`, `untranslated_examples`
- `ui_locale_publish.sh` now prints a locale-by-locale gap table after export.
- `ui_locale_publish.sh` also prints ui-page translation progress.
- Optional strict mode to block publish when translation gaps exist:
  - `UI_LOCALE_PROGRESS_STRICT=true bash tools/ui_locale_publish.sh`
  - `UI_PAGE_PROGRESS_STRICT=true bash tools/ui_locale_publish.sh`
- `ui_locale_publish.sh` / `ui_locale_sync.sh` secret file yoksa template olusturur ve durur.
- Optional: skip build check with:
  - `bash tools/ui_locale_publish.sh --no-build-check`
  - `bash tools/ui_locale_sync.sh --no-build-check`
- Progress API (admin token/auth):
  - `GET /api/ui-locales/meta/progress`
  - `GET /api/ui-locales/meta/<locale>/reference-preview?state=missing`
- UI language and Atlas language are separated:
  - UI can be `fr` (or any added locale)
  - Atlas content keeps its own supported set and falls back to `en` if requested locale is missing

## UI Page Translation Progress (About/Rules/Help)
`ui-page` pages are content pages with fixed keys:
- `about`, `rules`, `help`

Stable URL pattern:
- `/:lang/:page_key` (example: `/tr/about`)

Admin/auth endpoints:
```bash
# overall translation status by page and locale
curl -H "Authorization: Bearer <TOKEN>" \
  http://127.0.0.1:1337/api/ui-pages/meta/progress

# side-by-side reference preview for one page+locale
curl -H "Authorization: Bearer <TOKEN>" \
  "http://127.0.0.1:1337/api/ui-pages/meta/about/reference-preview?locale=tr"

# one-command summary report (reads STRAPI_API_TOKEN from ui_locale secret file)
bash tools/ui_page_progress_report.sh
# strict mode (fails if any page has missing/draft locales)
UI_PAGE_PROGRESS_STRICT=true bash tools/ui_page_progress_report.sh
```

Notes:
- `reference-preview` is intended for editor UI/forms (EN reference vs target locale fields).
- If target locale is missing/draft, frontend falls back to EN and sets noindex.

## Post-Deploy Smoke (Domain-Level)
```bash
cd /home/ali/geovito-stack
BASE_URL=https://geovito.com bash tools/post_deploy_smoke.sh
EXPECTED_SHA7=$(git rev-parse --short=7 HEAD) BASE_URL=https://geovito.com bash tools/post_deploy_smoke.sh
```

What it verifies:
- `/.well-known/geovito-build.json` returns 200 and exposes `build_sha7`
- `/sitemap.xml` returns 200
- `/en/atlas/italy-pilot/` stays indexable + canonical self
- `/de/atlas/italy-pilot/` stays noindex + canonical EN

## Release Standard (One Command)
This is the default release verification command:
```bash
cd /home/ali/geovito-stack
bash tools/release_deploy_smoke.sh --with-moderation
```

What it does:
- forces Cloudflare Pages deploy to current `HEAD` SHA (`tools/pages_deploy_force.sh`)
- runs domain smoke checks with Access token (`tools/smoke_access.sh`)
- runs moderation queue stale-pending guard (`tools/blog_moderation_report.sh --fail-on-stale-pending`)

First-time setup (one-time):
```bash
cd /home/ali/geovito-stack
bash tools/pages_deploy_env_init.sh
bash tools/smoke_access_env_init.sh
```

Optional tuning:
- pending age threshold: `BLOG_MOD_PENDING_ALERT_HOURS` (default `24`)
- custom moderation args passthrough:
  - `SMOKE_BLOG_MODERATION_ARGS="--fail-on-stale-pending --json" bash tools/release_deploy_smoke.sh --with-moderation`
- optional bulk moderation action during release:
  - `COMMENT_BULK_ACTION=approve-next-bulk COMMENT_BULK_LIMIT=10 bash tools/release_deploy_smoke.sh --with-comment-bulk-action`
  - dry-run preview (no write):
    - `COMMENT_BULK_ACTION=approve-next-bulk COMMENT_BULK_LIMIT=10 COMMENT_BULK_DRY_RUN=true bash tools/release_deploy_smoke.sh --with-comment-bulk-action`
- optional mock re-seed after all release stages:
  - `bash tools/release_deploy_smoke.sh --with-mock-reseed`
- optional ui-locale sync stage (import+export before progress check):
  - `bash tools/release_deploy_smoke.sh --with-ui-locale-sync`
  - default runs without build check (`tools/ui_locale_sync.sh --no-build-check`)
  - enable build check in sync stage:
    - `UI_LOCALE_SYNC_BUILD_CHECK=true bash tools/release_deploy_smoke.sh --with-ui-locale-sync`
- optional ui-locale translation gap check during release:
  - `bash tools/release_deploy_smoke.sh --with-ui-locale-progress`
  - strict mode default is `true` in this stage.
  - to only print warnings without fail:
    - `UI_LOCALE_PROGRESS_STRICT=false bash tools/release_deploy_smoke.sh --with-ui-locale-progress`
  - if progress report is missing, release script auto-runs `tools/export_ui_locales.sh`

## Pre-Design Gate (All Critical Checks)
```bash
cd /home/ali/geovito-stack
bash tools/pre_design_gate_check.sh
```

Includes:
- `tools/prod_health.sh`
- `tools/media_policy_check.sh`
- `tools/auth_flow_check.sh`
- `tools/oauth_config_check.sh`
- `tools/import_dormant_check.sh`
- `tools/translation_bundle_dormant_check.sh`
- `tools/import_log_sanity_check.sh`
- `tools/pre_import_index_gate_check.sh`
- `tools/shell_smoke_test.sh`
- `tools/pages_build_check.sh`
- `tools/purge_mock.sh`

Optional pre-design extensions:
- Blog engagement UI Playwright:
  - `RUN_BLOG_ENGAGEMENT_UI_GATE=true bash tools/pre_design_gate_check.sh`
- Bulk comment moderation action:
  - `RUN_COMMENT_BULK_GATE=true COMMENT_BULK_ACTION=approve-next-bulk COMMENT_BULK_LIMIT=10 bash tools/pre_design_gate_check.sh`
  - dry-run preview:
    - `RUN_COMMENT_BULK_GATE=true COMMENT_BULK_ACTION=approve-next-bulk COMMENT_BULK_LIMIT=10 COMMENT_BULK_DRY_RUN=true bash tools/pre_design_gate_check.sh`
- Auto re-seed mock data after final purge:
  - `RESEED_MOCK_AFTER_PURGE=true bash tools/pre_design_gate_check.sh`

## Logs By Domain
Domain log folders (human + jsonl):
- `logs/atlas/`
- `logs/blog/`
- `logs/ui/`
- `logs/search/`
- `logs/suggestions/`
- `logs/ops/` (mock seed/purge/operator actions)
- `logs/import/`
- `logs/ai/`

Not:
- `import` domain is reserved for future real import execution events.
- mock seed/purge events must go to `ops`, not `import`.

## Known Warning (Strapi 6 Migration Note)
Eger loglarda su uyari gorulurse:
- `admin.auth.options.expiresIn is deprecated and will be removed in Strapi 6`

Bu sprintte davranis degistirilmez; not edilir.
Strapi 6 gecisinde `admin.auth.sessions.maxRefreshTokenLifespan` ve
`admin.auth.sessions.maxSessionLifespan` alanlari ile yeni yapilandirma uygulanacaktir.

## How To Trace By Request ID
1. Capture request id from API response header:
   - `X-Request-ID`
2. Search JSONL logs:
```bash
cd /home/ali/geovito-stack
REQ_ID="<paste-request-id>"
rg -n "\"request_id\":\"${REQ_ID}\"" logs/**/*.jsonl
```
3. Search human logs:
```bash
cd /home/ali/geovito-stack
REQ_ID="<paste-request-id>"
rg -n "request_id=${REQ_ID}" logs/**/*.log
```

## Log Report
```bash
cd /home/ali/geovito-stack
bash tools/log_report.sh --since 24h
bash tools/log_report.sh --since 2h --domain suggestions
bash tools/log_report.sh --since 2h --domain ops
```

## Log Rotation / Retention
Default policy:
- rotate when file > 20MB
- keep last 10 rotations
- gzip rotated logs

```bash
cd /home/ali/geovito-stack
bash tools/log_rotate.sh
MAX_SIZE_MB=50 KEEP_ROTATIONS=14 GZIP_ROTATED=1 bash tools/log_rotate.sh
```

## Mock Data
```bash
cd /home/ali/geovito-stack
ALLOW_MOCK_SEED=true bash tools/mock_data.sh seed
bash tools/mock_data.sh clear
```

One-command purge:
```bash
cd /home/ali/geovito-stack
bash tools/purge_mock.sh
```

## User Roles + Auth Shell
- `public`:
  - read-only Atlas/Blog/UI
  - can submit Atlas suggestion (`POST /api/atlas-suggestions/submit`)
  - no create/update/delete access to Atlas/Blog/UI core endpoints
- `authenticated user`:
  - currently same effective write boundaries as public for core content
  - user-facing account/dashboard shell exists as read-only or coming-soon UX
- `editor/admin`:
  - Atlas and Blog editorial authority (review, publish, moderation)

Current auth mode:
- Email/password auth is the baseline.
- Public self-service account features are intentionally limited in this phase.
- `/[lang]/account/` and `/[lang]/dashboard/` always render safely (no build/runtime crash).

Auth runtime guards:
- `AUTH_LOCAL_REGISTER_ENABLED=true|false`:
  - `false` => `POST /api/auth/local/register` returns `403`
- `AUTH_GOOGLE_ENABLED=true|false`:
  - `false` => `/api/connect/google` and callback routes return `403`
- `AUTH_FACEBOOK_ENABLED=true|false`:
  - `false` => `/api/connect/facebook` and callback routes return `403`
- `AUTH_RATE_LIMIT_WINDOW_MS` + `AUTH_RATE_LIMIT_MAX`:
  - applies request throttling on login/register/forgot/reset/upload/social connect endpoints
- `TURNSTILE_ENABLED=true|false`:
  - `false` => captcha verification disabled (default)
  - `true` => login/register/forgot/reset/upload requests require valid Turnstile token
- `BLOG_COMMENT_GUEST_TURNSTILE_REQUIRED=true|false`:
  - only applies when `TURNSTILE_ENABLED=true`
  - `true` => guest blog comments require valid Turnstile token
  - registered comments remain token-free
- `TURNSTILE_SECRET_KEY`:
  - required when `TURNSTILE_ENABLED=true`
  - missing secret returns `503 TurnstileMisconfigured` on protected routes

Frontend provider buttons:
- `PUBLIC_AUTH_LOCAL_REGISTER_ENABLED=false` hides the register form in the frontend.
- `PUBLIC_AUTH_GOOGLE_ENABLED=true` and/or `PUBLIC_AUTH_FACEBOOK_ENABLED=true` are only UI toggles.
- Backend guard flags above must match, otherwise endpoint returns `403`.
- `PUBLIC_TURNSTILE_SITE_KEY`:
  - when set, auth forms render Cloudflare Turnstile widget and send `cf-turnstile-response`

Auth verification command:
```bash
cd /home/ali/geovito-stack
bash tools/auth_flow_check.sh
```

Expected:
- register endpoint follows `AUTH_LOCAL_REGISTER_ENABLED`
- `/api/connect/google` follows `AUTH_GOOGLE_ENABLED`
- `/api/connect/facebook` follows `AUTH_FACEBOOK_ENABLED`
- login endpoint is not hard-blocked (`403/429` unexpected on first attempt)
- forgot-password endpoint returns `200`
- reset-password invalid token check returns `400`
- if `TURNSTILE_ENABLED=true`, auth endpoints can return `403` until captcha token is provided

SMTP runtime (Strapi email provider):
- `EMAIL_PROVIDER=sendmail|nodemailer` (real SMTP icin `nodemailer`)
- `EMAIL_DEFAULT_FROM`, `EMAIL_DEFAULT_REPLY_TO`
- `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`
- `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`
- `EMAIL_SMTP_SECURE`, `EMAIL_SMTP_REQUIRE_TLS`, `EMAIL_SMTP_IGNORE_TLS`

SMTP verification:
```bash
cd /home/ali/geovito-stack
bash tools/smtp_config_check.sh
```

Password reset e2e smoke:
```bash
cd /home/ali/geovito-stack
RESET_SMOKE_EMAIL=you@example.com bash tools/password_reset_smoke.sh
```

OAuth provider configuration check:
```bash
cd /home/ali/geovito-stack
PUBLIC_SITE_URL=https://geovito.com bash tools/oauth_config_check.sh
```

Expected:
- Provider OFF ise check `skipped` yazar ve PASS verir.
- Provider ON ise `/api/connect/{provider}` redirect vermeli.
- Redirect `Location` provider hostuna gitmeli ve callback URL olarak
  `${PUBLIC_SITE_URL}/api/connect/{provider}/callback` veya
  `${PUBLIC_SITE_URL}/api/auth/{provider}/callback` icermelidir.
- Local `API_BASE=http://127.0.0.1:1337` testinde secure-cookie limiti nedeniyle 500 alinabilir;
  script bu durumda Strapi loglarinda `302` redirecti dogrulayip PASS verir.

OAuth provider apply (Strapi users-permissions store):
```bash
cd /home/ali/geovito-stack
bash tools/oauth_provider_apply.sh --dry-run
bash tools/oauth_provider_apply.sh
```

Required env vars when provider is enabled:
- `AUTH_GOOGLE_ENABLED=true` ise `AUTH_GOOGLE_CLIENT_ID` + `AUTH_GOOGLE_CLIENT_SECRET`
- `AUTH_FACEBOOK_ENABLED=true` ise `AUTH_FACEBOOK_CLIENT_ID` + `AUTH_FACEBOOK_CLIENT_SECRET`
- Optional callback path overrides:
  - `AUTH_GOOGLE_CALLBACK_PATH` (default `api/connect/google/callback`)
  - `AUTH_FACEBOOK_CALLBACK_PATH` (default `api/connect/facebook/callback`)
- Optional scope overrides:
  - `AUTH_GOOGLE_SCOPE` (default `email`)
  - `AUTH_FACEBOOK_SCOPE` (default `email`)

If `.env` changed and container env refresh is needed:
```bash
REFRESH_STRAPI_ENV=1 bash tools/oauth_provider_apply.sh --dry-run
```

## Media Upload Pipeline (Images)
Upload policy:
- Allowed image inputs: `jpg`, `jpeg`, `png`, `webp`.
- Conversion middleware converts new JPG/JPEG/PNG uploads to WebP.
- WebP uploads stay WebP (no second conversion).
- Active policy: `webp-first` (AVIF is not enabled in current baseline).
- OG/social preview fallback remains JPEG for broad crawler compatibility.

Runtime env knobs:
- `MEDIA_IMAGE_CONVERT_ENABLED=true|false`
- `MEDIA_IMAGE_TARGET_FORMAT=webp`
- `MEDIA_IMAGE_ALLOWED_INPUT_MIME=jpg,jpeg,png,webp`
- `MEDIA_IMAGE_QUALITY=35..95`
- `MEDIA_IMAGE_MAX_INPUT_BYTES` (conversion input cap)
- `MEDIA_IMAGE_CONVERT_STRICT=true|false` (`true` -> oversize conversion hard-fail)

Quick check:
```bash
cd /home/ali/geovito-stack
bash tools/media_policy_check.sh
```

## Content Embeds (YouTube/Facebook)
Embed contract:
- translation-level repeatable component (`provider`, `source_url`, optional `title/caption/start_seconds`)
- providers: `youtube`, `facebook`
- max 8 embed items per translation

Safety:
- backend whitelist/validation: `app/src/modules/content-embeds/index.js`
- frontend safe resolver: `frontend/src/lib/embed.ts`
- renderer: `frontend/src/components/content/EmbedGallery.astro`

Smoke verification:
```bash
cd /home/ali/geovito-stack
bash tools/shell_smoke_test.sh
```

See:
- `EMBED_SYSTEM.md`
- `UPLOAD_MAX_FILE_SIZE_BYTES` (upload request cap)

Operational notes:
- Conversion only runs on upload routes (`/api/upload` / `/upload`) and only for `POST`/`PUT`.
- Unsupported image formats return `415` with clear allowed-format message.
- Public role upload yetkisi acik degildir; medya yukleme editor/admin akisindadir.
- Social/share metadata fallback image remains JPEG:
  - `frontend/public/og-default.jpg`
  - Base layout emits `og:image` + `twitter:image` from this JPEG by default.

Policy guard:
```bash
cd /home/ali/geovito-stack
bash tools/media_policy_check.sh
```

## Blog Model + Permissions
- Model fields (active):
  - `post_id`, `translations[]` (`title/slug/body/language status`), `published_on`
  - `related_places` (optional Atlas relation)
  - `related_place_refs` (place_id list, frontend-safe linkage fallback)
  - `mock`
- Public API:
  - `GET /api/blog-posts` and `GET /api/blog-posts/:id` only
  - no public create/update/delete
- Authenticated users:
  - no direct Atlas mutation
  - blog submission workflow is reserved for a later phase

## Blog Engagement (Comments + Likes)
Active endpoints:
- `POST /api/blog-comments/submit` (public/guest + registered)
- `GET /api/blog-comments?post_id=<post_id>&limit=50` (approved-only list)
- `GET /api/blog-comments/count/<post_id>` (approved count)
- `POST /api/blog-likes/toggle` (authenticated only)
- `GET /api/blog-likes/count/<post_id>` (public count)

Comment moderation states:
- `pending`, `approved`, `rejected`, `spam`, `deleted`
- Guest comments are created as `pending`.
- Registered user comments can auto-approve after configured threshold:
  - `BLOG_COMMENT_REGISTERED_AUTO_APPROVE_AFTER` (default `2`)
- Lifecycle guard enforces status transitions and blocks illegal jumps:
  - `pending -> approved|rejected|spam|deleted`
  - `approved -> rejected|spam|deleted`
  - `rejected -> approved|deleted`
  - `spam -> rejected|deleted`
  - `deleted` is terminal
- `moderation_notes` is required when status becomes `rejected|spam|deleted`.
- `reviewed_at` and `reviewed_by` are auto-stamped on moderation transitions.

Engagement runtime env knobs:
- `BLOG_COMMENT_REGISTERED_AUTO_APPROVE_AFTER`
- `BLOG_COMMENT_GUEST_TURNSTILE_REQUIRED`
- `BLOG_COMMENT_GUEST_MAX_LINKS` (default `1`)
- `BLOG_COMMENT_GUEST_SPAM_LINKS` (default `3`)
- `BLOG_COMMENT_IP_HASH_SALT`
- `BLOG_LIKE_IP_HASH_SALT`
- `BLOG_LIKE_RATE_WINDOW_MS`
- `BLOG_LIKE_RATE_MAX`

Security notes:
- Guest comment endpoint supports optional Turnstile:
  - enable both `TURNSTILE_ENABLED=true` and `BLOG_COMMENT_GUEST_TURNSTILE_REQUIRED=true`
  - missing/invalid token => `403` on guest submit
- Guest comments are auto-flagged by link policy:
  - `url_count > BLOG_COMMENT_GUEST_MAX_LINKS` => forced `pending` + moderation note
  - `url_count >= BLOG_COMMENT_GUEST_SPAM_LINKS` => forced `spam` + moderation note
- Like toggle endpoint accepts route-level public access but enforces Bearer JWT in controller:
  - no token or invalid token => `401 Authentication is required`
  - this avoids runtime dependency on manual Authenticated role permission toggles.

Quick smoke:
```bash
cd /home/ali/geovito-stack
bash tools/blog_engagement_smoke.sh
# Optional authenticated like toggle check:
# BLOG_AUTH_JWT=<user_jwt> bash tools/blog_engagement_smoke.sh
```

State-machine contract check:
```bash
cd /home/ali/geovito-stack
bash tools/blog_comment_state_contract_check.sh
```

Moderation queue report (operator-friendly):
```bash
cd /home/ali/geovito-stack
bash tools/blog_moderation_report.sh
# JSON output:
# bash tools/blog_moderation_report.sh --json
# Fail if oldest pending comment is older than BLOG_MOD_PENDING_ALERT_HOURS:
# bash tools/blog_moderation_report.sh --fail-on-stale-pending
```

Strapi admin moderation flow:
1. Open `Content Manager -> Blog Comment`.
2. Filter by `status = pending`.
3. For each comment, set one of:
   - `approved`
   - `rejected` (requires `moderation_notes`)
   - `spam` (requires `moderation_notes`)
   - `deleted` (requires `moderation_notes`)
4. Save; lifecycle auto-fills `reviewed_at` and `reviewed_by`.

CLI moderation helper:
```bash
cd /home/ali/geovito-stack
# list pending queue
bash tools/blog_comment_moderate.sh list --status pending --limit 20

# set status (notes required for rejected/spam/deleted)
bash tools/blog_comment_moderate.sh set <comment_id> approved
bash tools/blog_comment_moderate.sh set <comment_id> rejected --notes "policy reason"

# quick operator flow (oldest pending item)
bash tools/blog_comment_quick_action.sh next
bash tools/blog_comment_quick_action.sh approve-next --notes "qa ok"
bash tools/blog_comment_quick_action.sh reject-next --notes "policy reason"

# quick bulk flow (oldest pending N items)
bash tools/blog_comment_quick_action.sh approve-next-bulk --limit 10 --notes "qa batch pass"
bash tools/blog_comment_quick_action.sh reject-next-bulk --limit 5 --notes "policy batch reject"

# dry-run preview (no write)
bash tools/blog_comment_quick_action.sh approve-next-bulk --limit 10 --notes "qa batch pass" --dry-run

# write JSON report artifact (for release/pre-design audit trail)
bash tools/blog_comment_bulk_report.sh --action approve-next-bulk --limit 10 --notes "qa batch pass"

# write JSON report artifact as dry-run preview
bash tools/blog_comment_bulk_report.sh --action approve-next-bulk --limit 10 --notes "qa batch pass" --dry-run
```

Optional release smoke extension:
```bash
cd /home/ali/geovito-stack
SMOKE_RUN_BLOG_MODERATION_REPORT=true bash tools/smoke_access.sh
```

## Atlas Editorial Workflow (Manual)
1. Create `Atlas Place` in Strapi admin.
2. Fill identity:
   - `place_id` (stable, immutable)
   - `place_type` (`country|admin1|admin2|admin3|locality|neighborhood|street|poi`)
   - `country_code`, `slug`
3. Set hierarchy:
   - `parent_place_id` and/or `parent` relation
   - optional `region_override` (manual region key override)
   - optional `editorial_notes`
4. Fill `translations[]` for each language:
   - `title`, `excerpt`, `body`, `status`
5. Mark a language as `complete` only when title + body are filled.

Country-profile sanity check:
```bash
cd /home/ali/geovito-stack
bash tools/country_profile_sanity_check.sh
# Optional strict reference validation:
# COUNTRY_PROFILE_SANITY_STRICT=true bash tools/country_profile_sanity_check.sh
```

Checklist endpoint (computed, read-only):
```bash
curl "http://127.0.0.1:1337/api/atlas-places/city-de-berlin/editorial-checklist?language=en"
```

Checklist now includes:
- `expected_parent_types`
- `expected_parent_labels`
- `profile_country_code`

## Atlas Indexability Verification
- `complete` language: indexable candidate
- `missing/draft` language: always `noindex,nofollow`
- `mock=true`: always `noindex,nofollow` + MOCK DATA banner
- sitemap includes only `mock=false` + `complete` language variants

Quick check examples:
```bash
curl -s http://127.0.0.1:4321/en/atlas/turkiye/ | rg -n "robots|MOCK DATA"
curl -s http://127.0.0.1:4321/es/atlas/germany/ | rg -n "robots|state-banner"
curl -s http://127.0.0.1:4321/sitemap.xml | head -n 40
curl -s http://127.0.0.1:4321/sitemaps/atlas-en-1.xml | head -n 40
```

Pre-import index gate automation:
```bash
cd /home/ali/geovito-stack
bash tools/pre_import_index_gate_check.sh
```

## Parent / Child Internal Linking
- Atlas place page renders:
  - breadcrumb hierarchy
  - parent block
  - children list
  - related places list
- Keep `parent_place_id` and `parent` relation aligned.

## Frontend (local)
```bash
cd /home/ali/geovito-stack/frontend
npm install
npm run dev
```

## Frontend Build (Cloudflare Pages compatible)
```bash
cd /home/ali/geovito-stack
bash tools/prod_smoke_frontend.sh
```

## Import Boundary
- Contract: `import-interface/contracts/atlas-import.v1.schema.json`
- Example: `import-interface/examples/atlas-import.v1.mock.json`
- Execution script: `tools/run_import.sh` -> intentionally disabled

## DB Backup / Rollback (Document-Only)
Pre-import gate oncesi:
- Postgres backup alin:
```bash
cd /home/ali/geovito-stack
docker compose exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > backup_pre_import.sql
```
- Rollback senaryosu:
```bash
cd /home/ali/geovito-stack
docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backup_pre_import.sql
```
- Backup dosyalari repo icine commit edilmez.

## Search Contract Export (Atlas, complete-only)
```bash
cd /home/ali/geovito-stack
bash tools/export_search_documents.sh
bash tools/export_blog_documents.sh
bash tools/suggest_internal_links.sh --blog artifacts/search/blog-documents.json
bash tools/suggest_internal_links.sh --text "Antalya ve New York icin gezi notu" --language tr --country-context TR
```

## Translation Bundle (Guarded)
```bash
cd /home/ali/geovito-stack
bash tools/export_translation_bundle.sh
bash tools/translation_bundle_dormant_check.sh
# Controlled phase only:
# TRANSLATION_BUNDLE_ENABLED=true bash tools/import_translation_bundle.sh --dry-run
# TRANSLATION_BUNDLE_ENABLED=true TRANSLATION_BUNDLE_ALLOW_STATUS_PROMOTE=true bash tools/import_translation_bundle.sh
```

Translation bundle safe-field contract:
- Allowed localized fields: `title`, `slug`, `excerpt`, `body`, `seo`
- Blocked core/editorial fields: parent relations, `place_type`, `country_profile`, `region_override`, `region_groups`, `mock`
- `status` and `last_reviewed_at` are mutable only when `TRANSLATION_BUNDLE_ALLOW_STATUS_PROMOTE=true`

## AI Smoke Tests (Flags OFF by default)
Enable flags first (`app/.env.example` -> real env):
- `AI_ENABLED=true`
- `AI_DIAGNOSTICS_ENABLED=true`
- `AI_DRAFT_ENABLED=true`

Then rebuild and run:
```bash
cd /home/ali/geovito-stack
docker compose up -d --build strapi

curl -X POST http://127.0.0.1:1337/api/ai/diagnostics \
  -H 'Content-Type: application/json' \
  -d '{"domain":"suggestions","since":"2h","max_lines":120}'

curl -X POST http://127.0.0.1:1337/api/ai/draft \
  -H 'Content-Type: application/json' \
  -d '{"mode":"atlas","target_place_id":"city-de-berlin","language":"en","notes":"focus on factual structure"}'
```

## Quick Smoke Checklist
```bash
cd /home/ali/geovito-stack
docker compose up -d --build strapi
curl -I http://127.0.0.1:1337/admin

curl -X POST http://127.0.0.1:1337/api/atlas-suggestions/submit \
  -H 'Content-Type: application/json' \
  -d '{"suggestion_type":"data_error","title":"smoke","description":"smoke","language":"en"}'

bash tools/shell_smoke_test.sh

./tools/run_import.sh && { echo "ERROR: import should be dormant"; exit 1; } || echo "OK: import remains dormant"
```

## Security Invariants
- Never log secrets/tokens/passwords in any domain log.
- Never expose Strapi publicly; keep host bind on `127.0.0.1:1337`.
- Keep AI endpoints disabled by default (`AI_*` flags false).
- Import execution remains dormant (`tools/run_import.sh` must fail by design).
- Mock data must remain visibly marked and non-indexed.
