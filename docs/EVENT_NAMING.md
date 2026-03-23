# Event Naming Standard M0

## Purpose
This document standardizes event names for future analytics and current logging/audit usage.
It is designed to be compatible with `LOG_CONTRACT.md` and `AUDIT_EVENTS.md`.

## Naming Format (Locked)
- Lowercase only
- Dot-separated segments
- Recommended shape:
  - `<domain>.<entity_or_scope>.<action>[.<result>]`

Examples:
- `go_live_gate_full.step`
- `dr.restore_run.complete`
- `moderation.content_report.set`
- `safety.kill_switch.apply`
- `release.gate.step.pass`

## Channel Relationship
Event names should map cleanly to contract channels:
- `app`: general runtime/app events
- `security`: auth/guard/security events
- `moderation`: moderation actions and queue state changes
- `audit`: privileged/audited action events
- `release`: release gate and deployment events
- `dr`: backup/restore/freshness events

Do not encode channel twice in inconsistent ways.
If channel is `dr`, event family should normally start with `dr.` (same for release/audit families where practical).

## Required Envelope Alignment
Event emission must remain compatible with contract envelope fields:
- `request_id`
- `route_or_action` (event name is carried here for contract logs)
- `meta` (object)
- nullable handling for `status`, `latency_ms`, `user_ref` where applicable

Reference:
- `docs/LOG_CONTRACT.md`
- `docs/LOGGING_GUIDE.md`

## Versioning and Deprecation
- Prefer stable event names.
- Do not churn names with suffixes like `_v2` when avoidable.
- Use explicit `event_version` in metadata/envelope for contract evolution.
- If deprecating an event:
  1. keep old + new in parallel for a transition window,
  2. document deprecation,
  3. remove old name only after consumers migrate.

## Recommended Domains
- `release.*`
- `dr.*`
- `moderation.*`
- `audit.*`
- `security.*`
- `analytics.*` (future, consent-bound)

## Good Examples
- `release.go_live_gate.start`
- `release.go_live_gate.summary`
- `dr.backup_run.start`
- `dr.restore_freshness.complete`
- `moderation.account_request.set`
- `audit.gate.go_live_full.override`
- `analytics.dashboard.section_view` (future)

## Avoid / Prone-to-Break Examples
- `GoLiveGateStep` (CamelCase)
- `release-go-live-step` (dash separated)
- `event` (too generic)
- `release.step.ok.now` (ambiguous segmentation)
- `analytics.user.fingerprint.track` (privacy violation)

## Privacy and Safety Guardrails
- Event names must not contain PII or secrets.
- Event metadata must follow `PII_POLICY.md` classification and minimization rules.
- Consent-first behavior is mandatory for future analytics families.
