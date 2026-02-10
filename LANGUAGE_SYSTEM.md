# Geovito Language System

## 1) Two-Layer Language Design
Geovito separates language concerns into two strict layers:
1. UI language layer (frontend file-based i18n)
2. Content language layer (Strapi translations with status)

They must never be mixed.

## 2) UI Language Layer (File-based)
Files:
- `frontend/src/i18n/en.json` (source of truth)
- `frontend/src/i18n/de.json`
- `frontend/src/i18n/es.json`
- `frontend/src/i18n/ru.json`
- `frontend/src/i18n/zh-cn.json`

Active route namespaces:
- `/en /de /es /ru /zh-cn`

Validation:
- `cd frontend && npm run i18n:check`
- Any key mismatch fails build.

Rules:
- no runtime UI machine translation
- no hardcoded UI copy outside i18n files
- EN keys define canonical UI schema

## 3) Content Language Layer (Strapi)
All localized content (`atlas_place`, `region_group`, `blog_post`, `ui_page`) uses `translations[]` with:
- `missing`
- `draft`
- `complete`

Language fields are normalized server-side by language-state module.

## 4) Indexing Rules by Domain

### Atlas + RegionGroup (strict)
- Indexable only if `lang=en` and `status=complete` and `mock=false`
- Non-EN: `noindex,nofollow`
- Non-EN canonical -> EN complete URL (when available)
- Runtime preview (`?translate=1`) always noindex

### UI/System Pages
- Editable per language as independent system content
- Canonical/self strategy can remain per-language
- Project can choose stricter EN-only policy later without changing Atlas rules

### Blog
- Translation statuses can be applied
- More flexible than Atlas, but mock/noindex and quality gating still enforced

## 5) Banner Semantics (Frontend)
State banners communicate non-index conditions:
- `state-banner mock`
- `state-banner fallback`
- `state-banner runtime`

Badges are rendered explicitly (MOCK/FALLBACK/RUNTIME).

## 6) Country Profile + Labels
Country-specific terms (State/Il/Province etc.) are label-mapped in `country_profile.label_mapping`.
This changes presentation only, not core storage model.

## 7) Translation Bundle Workflow (Guarded)
Translation bundle akisi import pipeline'dan ayridir:
- Export:
  - `bash tools/export_translation_bundle.sh`
- Import:
  - `bash tools/import_translation_bundle.sh`

Bundle import guard:
- `TRANSLATION_BUNDLE_ENABLED=false` varsayilan
- flag `true` olmadan import script `[DORMANT]` ile fail eder
- kontrol scripti: `bash tools/translation_bundle_dormant_check.sh`

Bundle safe-field kurali:
- `ui_page.translations`
- `region_group.translations`
- `country_profile` kurallari (`label_mapping`, `city_like_levels`, vb.)
- opsiyonel minimal `atlas_place.translations`

Import execution (gazetteer) bundleden ayri kalir ve dormant guardini korur.

## 8) Guardrails
Not allowed:
- Runtime translation for indexable pages
- Treating frontend as translation source of truth
- Bypassing status gate for SEO eligibility
