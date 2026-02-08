# Geovito AI Module

This module is intentionally isolated and feature-flag driven.

## Scope
- `diagnostics`: redacted operational diagnostics from log excerpts
- `draft`: author-only content draft generation using minimal Atlas context

## Hard Rules
- Disabled by default (`AI_ENABLED=false`)
- Never auto-publishes
- Never mutates Atlas entities directly
- Every invocation writes audit logs under `logs/ai/`

## Contracts
- `contracts/ai-diagnostics-output.v1.schema.json`
- `contracts/ai-draft-output.v1.schema.json`

## Route Definitions
- `routes/ai-diagnostics.js`
- `routes/ai-draft.js`
