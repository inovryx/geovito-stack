# Metadata Registry M0 (Documentation Foundation)

## Purpose
This document defines a lightweight, future-proof metadata registry for Geovito.
It is documentation-only in M0 and does not introduce new runtime collection.

## Non-goals (M0)
- No invasive tracking
- No new telemetry pipeline
- No new event emission in code
- No schema migration

## Clean Core Alignment
- Atlas remains authoritative (`CORE_CONTRACT.md`).
- Community and analytics layers must not mutate Atlas source-of-truth semantics.
- Registry entries explicitly mark `canonical` vs `derived` to avoid authority drift.

## Shared Taxonomy

### PII Classification (Locked)
- `none`: non-identifying operational/content metadata
- `pseudonymous`: stable pseudonymous identifiers (for example `user_ref` hash)
- `personal`: directly identifying personal data (email, IP when raw)
- `sensitive`: credentials/secrets/auth artifacts (token/secret/password/jwt/cookie)

### Access Levels
- `public`
- `member`
- `moderator`
- `admin`
- `owner`
- `ops`
- `system`

### Canonical vs Derived
- `canonical`: source-of-truth field used as primary authority.
- `derived`: computed/aggregated/indexed/transient field generated from canonical sources.

### Retention Labels
- `hot-14d`: short operational hot retention window
- `archive-90d`: compressed archive retention window
- `policy-security`: retained per security/audit policy
- `backup-policy`: retained per backup policy windows
- `session`: transient runtime/session scope

## 1) Content Metadata

| field name | meaning | example | pii classification | retention | access level | canonical vs derived | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `place_id` | Immutable Atlas place identifier | `pl_istanbul_001` | none | backup-policy | public | canonical | Core stable ID; must not be reassigned. |
| `slug` | Localized route slug for content entry | `istanbul-travel-guide` | none | backup-policy | public | canonical | SEO and routing critical; locale/index gates still apply. |
| `content_source` | Origin classification (atlas/ugc) | `ugc` | none | backup-policy | moderator | canonical | Must not allow UGC to override Atlas authority. |
| `submission_state` | Moderation state lifecycle | `submitted` | none | policy-security | moderator | canonical | Used with visibility rules in community contract. |
| `site_visibility` | Public surface visibility state | `hidden` | none | policy-security | moderator | canonical | Independent axis from moderation state. |
| `original_language` | Authoring/source language metadata | `tr` | none | backup-policy | moderator | canonical | Indexability still gated by EN completeness rules. |
| `indexability_status` | Computed SEO eligibility status | `noindex` | none | hot-14d | ops | derived | Derived from content state + SEO gates. |
| `sitemap_inclusion` | Derived sitemap inclusion result | `false` | none | hot-14d | ops | derived | Must remain false for non-eligible community states. |

### Future Mapping Notes
- Logging/event alignment: `LOG_CONTRACT.md`, `LOGGING_GUIDE.md`
- Community state authority: `COMMUNITY_SYSTEM.md`, `CORE_CONTRACT.md`
- Moderation/audit traceability: `AUDIT_EVENTS.md`

## 2) User/Community Metadata

| field name | meaning | example | pii classification | retention | access level | canonical vs derived | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `user_ref` | Pseudonymous user reference for logs/events | `u_7b9f0e1a4d2c1b3a` | pseudonymous | hot-14d | ops | derived | Preferred over raw user identifiers in logs. |
| `owner_user_id` | Internal owner user identifier linkage | `1284` | pseudonymous | backup-policy | admin | canonical | Internal-only ownership relation. |
| `creator_username` | Public creator handle | `olmysweet` | personal | backup-policy | public | canonical | Immutable after first profile creation (policy). |
| `profile_visibility` | Profile access policy | `members` | none | backup-policy | member | canonical | Drives route-level access behavior. |
| `follow_system_enabled` | Community follow feature policy flag | `false` | none | policy-security | owner | canonical | Runtime policy from community settings. |
| `notification_defaults` | Community default notification policy | `{ "email": false }` | none | policy-security | admin | canonical | Policy metadata, not user private content itself. |
| `account_request_state` | Account close/delete request workflow state | `approved` | none | policy-security | moderator | canonical | Auditable moderation surface. |
| `guest_comment_email_presence` | Whether guest email exists (boolean only) | `true` | pseudonymous | hot-14d | moderator | derived | Never store/emit raw guest email in logs. |

### Future Mapping Notes
- Community model and permissions: `COMMUNITY_SYSTEM.md`
- Privacy and retention baseline: `PRIVACY_RETENTION.md`, `PII_POLICY.md`
- Audit requirements for privileged changes: `AUDIT_EVENTS.md`

## 3) Ops/Release/DR Metadata

| field name | meaning | example | pii classification | retention | access level | canonical vs derived | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `request_id` | Correlation ID across request/script flow | `gv-run-20260323T185848Z-30420` | none | hot-14d | ops | canonical | Required by contract logs and operational tracing. |
| `route_or_action` | Contract event action/route name | `go_live_gate_full.step` | none | hot-14d | ops | canonical | Naming rules are governed by `EVENT_NAMING.md`. |
| `channel` | Contract log channel taxonomy | `release` | none | hot-14d | ops | canonical | Must be one of locked six channels. |
| `run_id` | Script/job run identity in meta | `gv-run-20260323T185848Z-30420` | none | hot-14d | ops | canonical | Mirrors request correlation in script mode. |
| `backup_stamp` | Backup snapshot stamp | `20260317T221251Z` | none | backup-policy | ops | canonical | DR restore and verify chain key. |
| `restore_target` | Restore target environment | `staging` | none | policy-security | ops | canonical | Non-prod restore-first discipline. |
| `go_live_override_ticket` | Emergency override incident ticket ref | `INC-1005` | none | policy-security | owner | canonical | Required for audited override usage. |
| `latency_ms` | Measured processing time metric | `6125` | none | hot-14d | ops | derived | Nullable by contract when not applicable. |

### Future Mapping Notes
- Contract envelope and redaction: `LOG_CONTRACT.md`, `LOGGING_GUIDE.md`
- Release and DR event families: `RELEASE_LOG_FORMAT.md`, `DR_LOG_FORMAT.md`
- Override and privileged event controls: `AUDIT_EVENTS.md`, `GO_LIVE_GATE.md`

## 4) Analytics/Event Metadata

Privacy-first rules for this section (locked in M0):
- no invasive tracking
- consent-first collection
- no fingerprinting or device-stable surrogate identifiers
- event metadata limited to minimum operational/measurement needs

| field name | meaning | example | pii classification | retention | access level | canonical vs derived | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `event_name` | Normalized analytics/logging event identifier | `release.gate.step.pass` | none | hot-14d | ops | canonical | Must follow `EVENT_NAMING.md` rules. |
| `event_version` | Event contract version marker | `1` | none | hot-14d | system | canonical | Prefer explicit version field over name suffix churn. |
| `event_ts` | Event occurrence timestamp | `2026-03-23T18:58:49Z` | none | hot-14d | ops | canonical | ISO-8601 UTC recommended. |
| `consent_scope` | Consent envelope applicable to event stream | `analytics_granted` | none | session | system | canonical | Required before user analytics collection expansion. |
| `session_ref` | Ephemeral session pseudonymous reference | `sess_9f31b2` | pseudonymous | session | system | derived | No long-lived cross-context identity stitching in M0. |
| `feature_context` | Feature/workflow context tag | `dashboard_activity` | none | hot-14d | ops | canonical | Keep scoped and low-cardinality. |
| `error_class` | Sanitized error bucket/classification | `TurnstileVerificationFailed` | none | hot-14d | ops | derived | Must not embed raw secret payloads. |
| `delivery_status` | Pipeline delivery outcome metadata | `accepted` | none | hot-14d | ops | derived | Operational quality metric, not product state authority. |

### Future Mapping Notes
- Envelope alignment with contract logs: `LOG_CONTRACT.md`
- Request correlation and redaction baseline: `LOGGING_GUIDE.md`
- Naming and versioning rules: `EVENT_NAMING.md`

## Governance Notes
- This registry is M0 foundation and intentionally non-exhaustive.
- Future expansions should add fields without breaking existing field semantics.
- Any field with `personal` or `sensitive` class requires explicit policy review before implementation.
