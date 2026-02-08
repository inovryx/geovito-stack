# Geovito Search System

## Purpose
Search is a separate domain, not a CMS side-effect.

Current architecture keeps search decoupled and import-ready while Atlas import remains dormant.

## Service Boundary
Independent service:
- `services/search-indexer/`

Strapi is canonical content source.
Search index is a derived read model.

## Domain Separation
Search domains are isolated:
1. Atlas search
2. Blog search
3. System/help search (future)

Rules:
- No mixed ranking logic across domains.
- Language-state gates index eligibility.
- Atlas hierarchy (country -> admin -> city -> district) is preserved in searchable documents.

## Current API Surface (search-indexer)
- `GET /health`
- `POST /webhook`
- `POST /reindex`

These endpoints currently accept events and log requests.

## Contracts
Schema contracts are defined under:
- `services/search-indexer/contracts/atlas-document.v1.schema.json`
- `services/search-indexer/contracts/blog-document.v1.schema.json`
- `services/search-indexer/contracts/search-upsert-event.v1.schema.json`

This keeps search import-ready without forcing active indexing jobs now.

## Language Rules in Search
- Index only `complete` content variants.
- Store `language`, `canonical_language`, `is_indexable` fields.
- Runtime translation previews never become index documents.

## Atlas-Specific Search Rules
- Place identity key: `place_id` (immutable)
- Stable URLs and canonical continuity are mandatory.
- Aliases and normalized tokens are additive, never destructive.

## Blog-Specific Search Rules
- Blog documents do not mutate Atlas truth.
- Place links are optional enrichments.
- Blog ranking rules do not override Atlas ranking rules.

## Not In Scope (Current Phase)
- Active crawler/fetch jobs from Wikidata/OSM
- Cron-driven full reindex orchestration
- Relevance tuning by monetization signals

## Evolution Plan
When import pipeline is activated later:
1. Validate event payload against contracts.
2. Apply domain-specific transform.
3. Upsert domain-specific search index.
4. Keep idempotent event processing.
