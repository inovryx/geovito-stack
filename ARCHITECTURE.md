# Geovito Clean Core Architecture

Status: active baseline (prod-first, import-dormant)  
Repo: `/home/ali/geovito-stack`

## 1) System Shape
- `app/`: Strapi canonical CMS/API (authority)
- `frontend/`: Astro consumer layer (Cloudflare Pages target)
- `services/search-indexer/`: derived search layer

Core principles:
- Atlas is authoritative.
- Blog/UI are separate contributory/system domains.
- Frontend is not authoritative; no hidden business authority.
- Import execution is dormant by design.

## 2) Domain Boundaries

### Atlas Core
- Model: `api::atlas-place.atlas-place`
- Stable `place_id` + stable slug policy
- Single global place model
- Country-specific rules live in `country_profile`

### Country Profile
- Model: `api::country-profile.country-profile`
- Key fields: `enabled_levels`, `parent_rules`, `label_mapping`, `city_like_levels`, `region_auto_assign`
- Purpose: country-specific hierarchy differences without schema fork

### Region Group (Grouping Layer)
- Model: `api::region-group.region-group`
- Region pages/grouping (for example TR regional group pages)
- Not part of canonical parent chain

### Blog
- Model: `api::blog-post.blog-post`
- Contributory domain
- Optional Atlas linking only; no Atlas override

### UI/System
- Model: `api::ui-page.ui-page`
- About/Rules/Help and similar pages
- UI language text is Strapi-managed (ui-locale) and exported at build-time

### UI Locale
- Model: `api::ui-locale.ui-locale`
- One record per UI locale (`en`, `tr`, `de`, `es`, `ru`, `zh-cn`, `fr`, ...)
- Locale field: `ui_locale` (avoid Strapi reserved `locale` key)
- JSON strings exported into `frontend/src/i18n/*.json` at build-time
- UI locale set is independent from Atlas locale set.
- Atlas content still falls back to EN when requested UI locale is not available in Atlas translations.

### Content Embeds
- Shared translation-level embed contract (`youtube | facebook`)
- Provider whitelist + URL validation in Strapi lifecycle
- Frontend renders only normalized safe embed URLs
- Details: `EMBED_SYSTEM.md`

### Media Pipeline
- Backend middleware: `app/src/middlewares/mediapipeline.js`
- Upload conversion policy is `webp-first` for content images (JPG/PNG -> WebP)
- Social preview (OG/Twitter) fallback image is JPEG for widest crawler compatibility
- Policy/gates documented in `MEDIA_SYSTEM.md` and `tools/media_policy_check.sh`

### Suggestions
- Model: `api::atlas-suggestion.atlas-suggestion`
- Public submit + editorial moderation workflow
- Never auto-mutates Atlas

### User Preference
- Model: `api::user-preference.user-preference`
- Stores authenticated user UI preference (`preferred_ui_language`)
- Separate from Atlas language model; controls site shell language only

### Search
- Derived index layer (not canonical source)
- Atlas and Blog contracts/ranking remain separated

### Import (Dormant)
- Gazetteer/import models/contracts exist
- Real import execution remains disabled by default

## 3) Language and SEO Contract

UI locales:
- `en`, `tr`, `de`, `es`, `ru`, `zh-cn`

Atlas/Region language status:
- `missing`, `draft`, `complete`

Strict index gate:
- indexable only when `lang=en` + `status=complete` + `mock=false`
- non-EN variants are `noindex,nofollow` and canonicalize to EN complete URL
- mock content is always noindex

Authoring model:
- TR can be authoring locale
- EN remains canonical/index locale

## 4) Editorial Safety (Panel-First)
- Strapi admin is canonical editorial surface
- Atlas place creation/edit is hierarchy-safe via server-side validation
- Country profile and region group are panel-editable
- UI pages are panel-editable per locale

Server-side enforcement:
- parent/child legality from `country_profile.parent_rules`
- level enablement from `country_profile.enabled_levels`
- no cycle, no cross-country invalid parent link
- region precedence and additive region-group membership

## 5) Region Behavior (Global-Safe)
Effective region precedence:
1. `region_override` (manual)
2. `country_profile.region_auto_assign`
3. `null`

If effective region resolves:
- `region` field is set
- matching `region_group` membership is enforced idempotently/additively
- manual extra memberships are preserved

## 6) Translation Bundle Boundary
Scripts:
- `tools/export_translation_bundle.sh`
- `tools/import_translation_bundle.sh`
- `tools/translation_bundle_dormant_check.sh`

Guards (default):
- `TRANSLATION_BUNDLE_ENABLED=false`
- `TRANSLATION_BUNDLE_ALLOW_STATUS_PROMOTE=false`

Import is idempotent and safe-field scoped.  
Real country import execution is still dormant.

## 7) Auth Boundary (Current State)
- Local register/login baseline exists (users-permissions)
- Social auth (Google/Facebook) infrastructure exists but is default OFF
- Provider apply/check scripts are available:
  - `tools/oauth_provider_apply.sh`
  - `tools/oauth_config_check.sh`
  - `tools/auth_flow_check.sh`

Important:
- Frontend provider buttons are UI toggles only.
- Backend runtime flags and provider store config must match.

## 8) Frontend Route Plan
- `/:lang/`
- `/:lang/atlas/`
- `/:lang/atlas/:placeSlug/`
- `/:lang/regions/`
- `/:lang/regions/:regionSlug/`
- `/:lang/blog/`
- `/:lang/blog/:postSlug/`
- `/:lang/about|rules|help|privacy|cookies|terms`
- `/:lang/login|register|account|dashboard`

Intentionally removed:
- `/:lang/ops/*` (ops pages are not part of current baseline)

## 9) Health and Deploy Verification
- Backend health endpoint: `GET /api/_health`
  - policy: localhost or `x-health-token` match
- Build fingerprint endpoint:
  - `/.well-known/geovito-build.json`
  - used by deploy smoke checks

## 10) Operational Gates
Critical scripts:
- `tools/pre_design_gate_check.sh`
- `tools/pre_import_index_gate_check.sh`
- `tools/shell_smoke_test.sh`
- `tools/pages_build_check.sh`
- `tools/import_dormant_check.sh`
- `tools/translation_bundle_dormant_check.sh`
- `tools/stack_health.sh`
- `tools/post_deploy_smoke.sh`

These must stay green before merge/deploy.
