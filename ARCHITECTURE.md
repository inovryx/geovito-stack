# Geovito Clean Core Atlas Architecture

## 1) Live Platform Shape
- `app/`: Strapi canonical CMS + API
- `frontend/`: Astro read-only consumer (Cloudflare Pages target)
- `services/search-indexer/`: domain-separated derived search layer

Core guardrails:
- Atlas is authoritative
- Blog/UI are contributory or system domains
- Import execution remains dormant
- Frontend does not own business truth

## 2) Domain Separation (Non-Negotiable)

### Atlas Domain
- Primary model: `api::atlas-place.atlas-place`
- One global place model with country-specific behavior via profile rules
- Stable `place_id`, immutable identity, canonical URL continuity

### Region Group Domain (Atlas-adjacent, non-parent chain)
- Model: `api::region-group.region-group`
- Purpose: country-specific grouping pages (example: Turkiye geographic regions)
- Grouping does not force extra parent levels in core place hierarchy

### Country Profile Domain
- Model: `api::country-profile.country-profile`
- Purpose: country-specific level enablement, label mapping, parent validation rules, optional auto-region assignment
- Keeps global schema stable while allowing country variation

### Blog Domain
- Model: `api::blog-post.blog-post`
- Independent from Atlas authority
- Optional place references only

### UI/System Domain
- Model: `api::ui-page.ui-page`
- Home/About/Rules/Help and system content
- UI text layer remains file-based i18n in frontend

### Suggestion Domain
- Model: `api::atlas-suggestion.atlas-suggestion`
- Public submit + editorial moderation
- No automatic Atlas mutation

### Search Domain
- Derived from canonical content
- Atlas and Blog ranking/index contracts separated

### Import Domain (Dormant)
- `api::gazetteer-entry.gazetteer-entry`
- `api::import-batch.import-batch`
- Contract-ready, execution disabled by default

## 3) Atlas Data Model (Single Core + Country Variants)

### `atlas_place`
Key fields:
- `place_id` (immutable)
- `place_type`:
  - modern levels: `country|admin1|admin2|admin3|locality|neighborhood|street|poi`
  - compatibility levels kept active: `admin_area|city|district`
- `country_code`
- `parent` + `parent_place_id`
- `translations[]` with `missing|draft|complete`
- `country_profile` relation
- `region_groups` relation
- optional `region`, `region_override`, `editorial_notes`, `lat/lng`
- `mock`

### `country_profile`
Key fields:
- `country_code`
- `enabled_levels[]`
- `parent_rules{}`
- `label_mapping{}`
- `city_like_levels[]`
- compatibility mirror: `level_labels{}`
- `region_auto_assign{ by_place_id / by_slug / by_admin1_place_id / by_admin1_slug }`
- `mock`

### `region_group`
Key fields:
- `region_key` (stable key)
- `country_code`
- `translations[]`
- `members` (many-to-many Atlas places)
- optional `country_profile` relation
- `mock`

## 4) Validation Rules (Server-side)
Validation runs in Strapi lifecycle before create/update:
- `place_type` must be in allowed type set
- non-country place must have parent
- country must not have parent
- `country_code` normalized and enforced
- parent/child compatibility resolved via effective country profile rules
- hierarchy cycle detection blocks circular parent chains
- coordinates normalized (`lat/lng`, `latitude/longitude`)
- `place_id` immutable after creation
- canonical slug immutability preserved
- effective region precedence:
  - `region_override` (manual) wins
  - otherwise country-profile auto mapping resolves region
- effective region is written to `region`
- resolved effective region enforces additive `region_groups` membership (auto group + manual groups)

This enables form-based editorial additions without import execution.

## 5) Frontend Route Plan
Implemented/active routes:
- `/:lang/atlas/:placeSlug/`
- `/:lang/atlas/`
- `/:lang/regions/:regionSlug/`
- `/:lang/regions/`
- `/:lang/blog/` and `/:lang/blog/:postSlug/`
- `/:lang/about|rules|help`
- `/:lang/account` and `/:lang/dashboard`

Frontend remains read-only and renders Strapi output + SEO meta decisions.

## 6) SEO / Index Contract (Atlas + RegionGroup)
Atlas and RegionGroup use strict EN-centric gate:
- Indexable only when `lang=en` and translation state `complete` and `mock=false`
- Non-EN variants: `noindex,nofollow`
- Non-EN canonical points to EN complete URL when available
- Mock pages always noindex + mock banner

Sitemap includes only indexable documents (EN complete, non-mock).

## 7) Mock Layer and Safety
Mock data includes:
- Atlas places
- Blog posts
- UI pages
- Suggestions
- Gazetteer/import metadata
- Country profiles
- Region groups

All mock cleanup remains one-command via `tools/purge_mock.sh` and clear pipeline.

## 8) Translation Bundle Boundary (Locked by Default)
Dedicated scripts exist for form-friendly translation bundle operations:
- `tools/export_translation_bundle.sh`
- `tools/import_translation_bundle.sh`

Import side remains locked unless `TRANSLATION_BUNDLE_ENABLED=true`.
Default mode is dormant and enforced by:
- `tools/translation_bundle_dormant_check.sh`

Bundle import is idempotent and safe-field scoped for:
- `ui_page`
- `country_profile`
- `region_group`
- optional minimal `atlas_place` translation fields

## 9) Import Boundary
Import is intentionally dormant:
- no cron
- no automatic fetch
- no background importer in runtime
- `tools/run_import.sh` returns non-zero with `[DORMANT]`

Future import runs in controlled phases with idempotency + safe-field contracts.
