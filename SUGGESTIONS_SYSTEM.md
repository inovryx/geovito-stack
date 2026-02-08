# Geovito Suggestions System

## Goal
`atlas-suggestion` domain lets users submit Atlas corrections or additions without editing Atlas directly.

Atlas remains authoritative.
Suggestions are review inputs.

## Submit Flow
Public endpoint:
- `POST /api/atlas-suggestions/submit`

Accepted public fields:
- `suggestion_type`
- `title`
- `description`
- `target_place_ref` (optional)
- `evidence_urls` (optional)
- `language`
- `display_name` (optional)
- `email` (optional)

Server-side safety:
- status is forced to `new`
- input is sanitized
- length/url validation is enforced
- basic in-memory rate-limit is enforced per client IP

Response is minimal:
- `{ ok: true, status: "received", suggestion_ref: "..." }`

## Moderation States
State enum:
- `new`
- `triaged`
- `accepted`
- `rejected`
- `implemented`

Allowed transitions:
- `new -> triaged`
- `triaged -> accepted | rejected`
- `accepted -> implemented`

Terminal states:
- `rejected`
- `implemented`

Illegal transitions are blocked by lifecycle validation.

## Moderation Rules
- Suggestions never auto-update Atlas.
- `accepted` or `rejected` requires `moderation_notes`.
- On accepted/rejected, moderation metadata is recorded (`reviewed_at`, admin info if available).
- `implemented` is set only after manual Atlas update has been done.

## Admin Review
Use Strapi content manager list for `atlas-suggestion` with filters:
- status
- suggestion_type
- language

Recommended review sequence:
1. Move `new -> triaged`
2. Decide `accepted` or `rejected` with notes
3. If accepted: apply Atlas change manually
4. Move suggestion to `implemented`

## Anti-Spam Basics
- Public submit endpoint has per-IP request threshold in a sliding window.
- Suspicious payloads (invalid URLs, oversized text) are rejected early.
- Source IP is hashed before storage (`source_ip_hash`).

## Mock Data
- `npm run mock:seed` creates two mock suggestion records (`mock=true`).
- `npm run mock:clear` removes all suggestion mocks together with other mock domains.

## Scope Boundaries
In scope:
- submission, triage, decision, implementation tracking

Out of scope:
- automatic Atlas patching
- automated trust scoring
- ML moderation
