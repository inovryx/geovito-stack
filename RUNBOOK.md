# Geovito Stack Runbook (Clean Rebuild)

## Stack
- Strapi (Docker) + Postgres
- Astro frontend (Cloudflare Pages target)
- Import execution: disabled (dormant contract mode)
- Repo mode: PROD-FIRST (single live standard)

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
```

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

## Pre-Design Gate (All Critical Checks)
```bash
cd /home/ali/geovito-stack
bash tools/pre_design_gate_check.sh
```

Includes:
- `tools/prod_health.sh`
- `tools/import_dormant_check.sh`
- `tools/translation_bundle_dormant_check.sh`
- `tools/import_log_sanity_check.sh`
- `tools/pre_import_index_gate_check.sh`
- `tools/shell_smoke_test.sh`
- `tools/pages_build_check.sh`
- `tools/purge_mock.sh`

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
```

Checklist endpoint (computed, read-only):
```bash
curl "http://127.0.0.1:1337/api/atlas-places/city-de-berlin/editorial-checklist?language=en"
```

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
node tools/suggest_internal_links.js \
  --atlas artifacts/search/atlas-documents.json \
  --blog artifacts/search/blog-documents.json
```

## Translation Bundle (Guarded)
```bash
cd /home/ali/geovito-stack
bash tools/export_translation_bundle.sh
bash tools/translation_bundle_dormant_check.sh
# Controlled phase only:
# TRANSLATION_BUNDLE_ENABLED=true bash tools/import_translation_bundle.sh
```

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
