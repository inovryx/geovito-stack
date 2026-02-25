# Geovito Moderation Runbook

## Objective
Operate UGC safely while preserving Clean Core and SEO contracts.

## Queues
- Post moderation queue (`submitted` content)
- Comment moderation queue
- Content report inbox (`new|reviewing|resolved|dismissed`)
- Account request queue (`deactivate|delete`)

## Post Moderation Rules
Allowed transitions:
- `submitted -> approved|rejected|spam|deleted`
- `approved -> rejected|spam|deleted`
- `rejected -> approved|deleted`
- `spam -> rejected|deleted`
- `deleted -> deleted`

Operational policy:
- `submitted + visible` can appear in-site as "In review".
- Only `approved + visible` can be considered indexable (subject to language gate).
- `rejected|spam|deleted` must not remain publicly visible.

## Report Handling
Target types:
- `post`, `comment`, `photo`, `profile`

Recommended triage:
1. Validate target exists and reason is coherent.
2. Move `new -> reviewing` for active processing.
3. Apply action to target (keep/restrict/remove).
4. Close as `resolved` or `dismissed` with moderator note.

## Guest Comment Safety
When guest comments are enabled:
- Enforce bot challenge policy (Turnstile where configured).
- Enforce rate limits.
- Enforce stricter link policy than member comments.
- Never expose guest email in public serializers/UI.

## Account Deactivate/Delete Requests
- Requests are manual-review workflow items.
- Default delete policy: anonymize/retain community-safe content unless legal/business policy requires hard deletion.
- Record moderator resolution notes.

## Verification Commands
- Contract checks:
`bash tools/blog_comment_state_contract_check.sh`
- Engagement policy:
`bash tools/blog_engagement_policy_check.sh`
- UGC contract:
`bash tools/ugc_api_contract_check.sh`
- Full pre-design gate:
`bash tools/pre_design_gate_check.sh`
