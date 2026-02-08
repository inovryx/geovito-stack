# Geovito CMS (Strapi)

## Domain Models
- `atlas-place`: place_id merkezli Atlas kaydi
- `blog-post`: Atlas'tan bagimsiz blog kaydi (opsiyonel place link)
- `ui-page`: Home/About/Rules/Help gibi sistem sayfalari
- `atlas-suggestion`: Atlas duzeltme/ekleme onerileri (manuel review)
- `gazetteer-entry`: dormant import landing kaydi
- `import-batch`: batch metadata + idempotency kaydi
- `ai` endpoints: diagnostics + draft (local-only, feature-flag gated)

## Language State
Her icerikte `translations[]` kullanilir:
- `status`: `missing | draft | complete`
- sadece `complete` indexlenebilir
- runtime/on-demand ceviri noindex'tir

Atlas editorial lifecycle:
- `place_id` immutable
- `place_type` supports `country|admin_area|city|district|poi`
- `parent_place_id` and `parent` relation are validated/synced
- `status=complete` requires non-empty `title` and `body`

Computed checklist endpoint:
- `GET /api/atlas-places/:placeId/editorial-checklist?language=en`

## Commands
```bash
npm run develop
npm run build
npm run start
ALLOW_MOCK_SEED=true npm run mock:seed
npm run mock:clear
```

Production guardrails:
- `SEED_MOCK_ON_BOOT=true` is blocked when `NODE_ENV=production`.
- `mock:seed` requires explicit `ALLOW_MOCK_SEED=true`.
- `mock:clear` is always allowed (warns in production).
- `AI_*` flags are disabled by default.

## Public Read Endpoints
Route-level `auth: false` ile acik endpointler:
- `atlas-place` -> `find`, `findOne`
- `blog-post` -> `find`, `findOne`
- `ui-page` -> `find`, `findOne`
- `atlas-suggestion` -> `submit` (`POST /api/atlas-suggestions/submit`)

AI endpoints (public degil):
- `POST /api/ai/diagnostics`
- `POST /api/ai/draft`

## Import
Bu repoda aktif import execution yoktur.
Kontrat: `../import-interface/`
