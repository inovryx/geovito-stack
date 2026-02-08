# Geovito Search Indexer

This service is intentionally independent from Strapi internals.
It accepts domain events and is contract-driven.

## Endpoints
- `GET /health`
- `POST /webhook`
- `POST /reindex`

## Contracts
See `contracts/` for document and event schemas.

## Design Notes
- Domain-aware: atlas and blog are indexed separately.
- Language-aware: index eligibility follows language-state gates.
- Import-ready: can ingest future import events without refactoring Strapi core.
