# Geovito I18N Governance (Site Usage Language)

## Scope
This governance is only for **site usage language**:
- dashboard
- account
- auth
- shell/layout
- navigation/sidebar/tools
- common system UI copy

Out of scope for this governance:
- Atlas authoritative content language model
- Blog content authoring language model

## Source Of Truth
1. `frontend/src/i18n/en.json` is the canonical source for UI keys.
2. Any new UI copy must add/update the EN key first.
3. Other locale files (`tr`, `fr`, and others) must follow EN key parity.

## Fallback Policy
1. Runtime fallback order is fixed:
   - active locale value
   - EN value
   - inline fallback (safety only)
2. Inline fallback text must not drift from EN source text.
3. Inline fallback is a temporary guardrail, not a content source.

## Missing Key Visibility (No Silent Chaos)
Use these checks to keep missing/fallback issues visible:

1. EN source key presence:
```bash
bash tools/i18n_source_audit.sh
```

2. Site-language fallback quality and EN drift audit:
```bash
bash tools/i18n_site_language_audit.sh
```
Artifacts:
- `artifacts/i18n/site-language-audit-last.json`
- `artifacts/i18n/site-language-audit-last.txt`

3. EN/TR/FR parity + untranslated visibility:
```bash
bash tools/i18n_parity_visibility.sh
```
Artifacts:
- `artifacts/i18n/site-language-parity-last.json`
- `artifacts/i18n/site-language-parity-last.txt`

## EN/TR/FR Policy
1. EN/TR/FR are strict parity locales for site usage language.
2. Missing/extra key parity mismatch is treated as failure in strict parity check.
3. Untranslated keys are visible and reportable; they are not automatically blocking by default.

## New UI Text Checklist
1. Add key/value in `en.json`.
2. Use `translate(ui, "key.path", ..., "EN fallback")` with fallback aligned to EN.
3. Add TR/FR values (or explicitly track untranslated in parity report).
4. Run:
```bash
cd frontend && node scripts/i18n_workflow.mjs check
```
5. Run:
```bash
bash tools/i18n_source_audit.sh
bash tools/i18n_site_language_audit.sh
bash tools/i18n_parity_visibility.sh
```

## Site UI Language vs Blog Language Boundary
1. Site UI language is user preference (`preferred_ui_language`) and drives interface copy.
2. Blog draft language is content metadata and remains independent from UI locale.
3. Blog create flow rule:
   - if request payload includes `language`/`canonical_language`, payload wins
   - otherwise, preferred UI language is used only if it is valid in blog language set
   - fallback remains `en`

## Atlas Boundary
Atlas language and authority contracts remain unchanged in this governance sprint.
