# Geovito CMS (Local)

## How to Run
1. Open terminal in `app/`.
2. Run `npm run develop`.
3. Open admin at `http://localhost:1337/admin`.

## Environment Notes
- Node.js 20+
- Default local database can be SQLite.
- Docker stack uses Postgres from repository root `docker-compose.yml`.

## Current Domain Structure
- `atlas-place`
- `atlas-suggestion`
- `blog-post`
- `ui-page`
- `gazetteer-entry` (dormant import landing)
- `import-batch` (dormant import metadata)

## Mock Data Commands
- `ALLOW_MOCK_SEED=true npm run mock:seed`
- `npm run mock:clear`

## Schema Discipline
- Keep schema files code-first and versioned.
- Do not add active import workers/cron in this repository.
- Keep language-state model (`missing|draft|complete`) enforced on content domains.
