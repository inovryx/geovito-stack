# Geovito Language System

## Scope Split
Geovito has two language layers that must never be mixed:

1. UI language layer (file-based)
2. Content language layer (Strapi-managed)

## 1) UI Language Layer

UI strings are stored in JSON files under `frontend/src/i18n/`:
- `en.json` (source of truth)
- `de.json`
- `es.json`
- `ru.json`
- `zh-cn.json`

Rules:
- No UI text is hardcoded in page/components.
- Runtime machine translation is not used.
- All UI labels, system hints, and banners come from i18n files.

### Runtime Preference Order
UI language selection follows this order:
1. User-selected language (`localStorage['geovito.ui_lang']`)
2. Browser language (if supported)
3. English fallback (`en`)

This is resolved on `frontend/src/pages/index.astro` before redirecting to `/:lang/`.

### Workflow
Validation and export commands:
- `cd frontend && npm run i18n:check`
- `cd frontend && npm run i18n:export`

`i18n:check` enforces key parity with `en.json`.
`i18n:export` creates flat key maps in `frontend/i18n-export/` for offline translation workflows.

## 2) Content Language Layer (Atlas/Blog/UI Content)

Content translations are stored in Strapi `translations[]` with explicit state:
- `missing`
- `draft`
- `complete`

Implemented in:
- `app/src/components/shared/localized-content.json`
- `app/src/modules/language-state/`

Rules:
- Only `complete` is indexable.
- Canonical always points to complete content.
- Runtime translation preview is non-indexed.

## SEO Safety Contract
- Any non-complete language variant is `noindex`.
- Any on-demand translation preview is `noindex`.
- UI language does not override content quality state.

## Future Extension Guardrails
Allowed:
- Add new supported UI locale files.
- Add offline translation tooling.

Not allowed:
- Inject runtime machine translation into UI.
- Bypass content language-state for SEO indexability.
