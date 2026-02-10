# Geovito Language System

## 1) Layer Separation (UI vs Content)
Geovito keeps two independent language layers:
1. UI language layer (frontend file-based JSON)
2. Content language layer (Strapi translations + status)

These layers are intentionally separate and cannot override each other.

## 2) UI Language Layer (File-based)
Source of truth:
- `frontend/src/i18n/en.json`

Supported UI locales:
- `en`, `tr`, `de`, `es`, `ru`, `zh-cn`

Files:
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/tr.json`
- `frontend/src/i18n/de.json`
- `frontend/src/i18n/es.json`
- `frontend/src/i18n/ru.json`
- `frontend/src/i18n/zh-cn.json`

Validation:
- `cd frontend && npm run i18n:check`
- Any key mismatch fails the build.

Rules:
- no runtime UI translation
- no hardcoded UI copy outside i18n files
- EN key-set defines the contract

## 3) Atlas Content Languages (Authoring + SEO)
Atlas locales:
- `en`, `tr`, `de`, `es`, `ru`, `zh-cn`

Per content-language status:
- `missing`
- `draft`
- `complete`

Authoring and SEO policy:
- TR is allowed as an editorial authoring locale.
- EN remains canonical SEO locale for index eligibility.
- Non-EN routes can render fallback/runtimes for UX, but stay noindex.

## 4) Indexing Rules (Atlas + RegionGroup)
Strict gate:
- Indexable only when `lang=en` + `status=complete` + `mock=false`
- Non-EN always `noindex,nofollow`
- Non-EN canonical points to EN complete URL (if available)
- Runtime preview (`?translate=1`) always `noindex,nofollow`
- Mock pages always `noindex,nofollow` + MOCK banner

## 5) Banner Semantics
Frontend keeps explicit state tokens:
- `state-banner mock`
- `state-banner fallback`
- `state-banner runtime`

These are test/gate markers and must remain stable.

## 6) Translation Bundle Workflow (Locked by Default)
Dedicated scripts:
- `bash tools/export_translation_bundle.sh`
- `bash tools/import_translation_bundle.sh`

Dormant guard:
- `TRANSLATION_BUNDLE_ENABLED=false` by default
- without enabling this flag, import exits non-zero with `[DORMANT]`
- check script: `bash tools/translation_bundle_dormant_check.sh`

Optional status promotion guard:
- `TRANSLATION_BUNDLE_ALLOW_STATUS_PROMOTE=false` by default
- if false: bundle cannot mutate translation status or `last_reviewed_at`
- if true: status updates are allowed as *promotion only* (no downgrade)

Dry-run:
- `TRANSLATION_BUNDLE_ENABLED=true bash tools/import_translation_bundle.sh --dry-run`

## 7) Translation Bundle Safe Update Contract
Allowed by bundle import (localized layer):
- `title`
- `slug`
- `excerpt`
- `body`
- `seo`

Blocked from bundle import (editorial/core safety):
- parent relations (`parent`, `parent_place_id`)
- `place_type`
- `country_profile` relation
- `region_override`
- `region_groups` relations
- `mock`
- runtime import flags / background import settings

Status workflow note:
- `status` and `last_reviewed_at` are blocked unless
  `TRANSLATION_BUNDLE_ALLOW_STATUS_PROMOTE=true`.

## 8) Example Editorial Flow (TR Authoring)
1. Editor writes Atlas content in TR via Strapi panel.
2. EN canonical content is completed/reviewed for SEO publication.
3. Remaining locales are translated offline.
4. Bundle export/import is used for controlled localized updates.
5. Import remains manual and guarded; no cron or auto-fetch runs.

## 9) Not Allowed
- Runtime translation for indexable pages
- Frontend becoming translation source of truth
- Bypassing EN-only index gate
- Enabling import execution by default
