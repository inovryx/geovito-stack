# Geovito Clean Core Atlas Architecture

## 1) Live Shape
- `app/`: Strapi canonical CMS/API
- `frontend/`: Astro read-only consumer (Cloudflare Pages target)
- `services/search-indexer/`: derived search layer

Core guardrails:
- Atlas authoritative
- Blog/UI contributory or system domains
- Import execution dormant
- Frontend non-authoritative

## 2) Domain Modules

### Atlas Core
- Model: `api::atlas-place.atlas-place`
- Stable `place_id`
- Single global `place_type` model
- Country-specific behavior via `country_profile`

### Country Profile
- Model: `api::country-profile.country-profile`
- Defines: `enabled_levels`, `parent_rules`, `label_mapping`, `city_like_levels`, `region_auto_assign`
- Keeps global schema stable while allowing country-level differences

### Region Group (Grouping Layer)
- Model: `api::region-group.region-group`
- Country-specific grouping pages (example: TR regional pages)
- Not part of canonical parent chain

### Blog
- Model: `api::blog-post.blog-post`
- Contributory domain
- Optional Atlas linking only

### UI/System
- Model: `api::ui-page.ui-page`
- Home/About/Rules/Help style pages
- UI text still file-based i18n in frontend

### Suggestions
- Model: `api::atlas-suggestion.atlas-suggestion`
- Public submit + editorial moderation
- No automatic Atlas mutation

### Search
- Derived from canonical content
- Atlas and Blog contracts separated

### Import (Dormant)
- Gazetteer/import models exist for contract readiness
- Execution remains disabled by default

## 3) Language + SEO Contract
UI locales:
- `en`, `tr`, `de`, `es`, `ru`, `zh-cn`

Atlas/RegionGroup statuses:
- `missing`, `draft`, `complete`

Index rule (strict):
- only `en + complete + mock=false` indexable
- non-EN noindex + canonical to EN complete
- mock always noindex

Authoring rule:
- TR can be editorial authoring locale
- EN remains canonical/index locale

## 4) Editorial Forms (Panel-first)
Strapi panel is canonical editorial surface:
- Atlas place create/edit with hierarchy safety
- Country profile rule editing
- Region group editing + membership
- UI page locale content editing

Server-side validation enforces:
- parent/child legality from `country_profile.parent_rules`
- level enablement from `country_profile.enabled_levels`
- cycle prevention
- country consistency
- region precedence and additive region group membership

## 5) Region Behavior (TR-safe, Global-safe)
Effective region precedence:
1. `region_override` (manual)
2. `country_profile.region_auto_assign` (including admin1 mapping)
3. else null

If effective region resolves:
- `region` field is set
- matching `region_group` membership is enforced additively
- manual extra memberships are preserved

## 6) Translation Bundle Boundary
Scripts:
- `tools/export_translation_bundle.sh`
- `tools/import_translation_bundle.sh`

Guards:
- `TRANSLATION_BUNDLE_ENABLED=false` (default)
- `TRANSLATION_BUNDLE_ALLOW_STATUS_PROMOTE=false` (default)

Import is idempotent and safe-field scoped.
No real import execution is enabled.

## 7) Frontend Route Plan
- `/:lang/`
- `/:lang/atlas/`
- `/:lang/atlas/:placeSlug/`
- `/:lang/regions/`
- `/:lang/regions/:regionSlug/`
- `/:lang/blog/`
- `/:lang/blog/:postSlug/`
- `/:lang/about|rules|help`
- `/:lang/account/`, `/:lang/dashboard/`

## 8) Operational Gates
Critical scripts:
- `tools/pre_design_gate_check.sh`
- `tools/pre_import_index_gate_check.sh`
- `tools/shell_smoke_test.sh`
- `tools/pages_build_check.sh`
- `tools/import_dormant_check.sh`
- `tools/translation_bundle_dormant_check.sh`

These must remain green before feature merges.
