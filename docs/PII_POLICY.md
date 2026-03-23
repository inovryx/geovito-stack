# PII Policy M0 (Privacy-First Metadata, Logging, Analytics)

## Purpose
This policy defines how personal data is classified and handled across metadata, logs, and future analytics.
It aligns with `LOG_CONTRACT.md`, `LOGGING_GUIDE.md`, `PRIVACY_RETENTION.md`, and `SECURITY_MODEL.md`.

## M0 Scope and Non-goals
- Documentation-first policy baseline
- No new tracking pipeline activation
- No invasive telemetry collection
- No runtime behavior changes in this sprint

## PII Classification (Locked)

### 1) `none`
Non-identifying technical or content metadata.
Examples:
- `channel`, `route_or_action`, `submission_state`, `event_version`

### 2) `pseudonymous`
Identifiers that are not directly identifying and are safe only with controlled access.
Examples:
- `user_ref` hash, ephemeral `session_ref`

### 3) `personal`
Directly identifying personal information.
Examples:
- raw email, direct username tied to person identity, raw IP

### 4) `sensitive`
Credentials and high-risk secrets.
Examples:
- `token`, `secret`, `password`, `authorization`, `api_key`, `jwt`, `cookie`

## Handling Rules by Class

| class | collect | store | log | share |
| --- | --- | --- | --- | --- |
| `none` | allowed (minimal necessity) | allowed | allowed | role-bound |
| `pseudonymous` | allowed (purpose-bound) | allowed | allowed with caution | restricted |
| `personal` | allowed only when product/security requires | restricted retention/access | avoid in logs; mask if unavoidable | strict least-privilege |
| `sensitive` | avoid by default; only security-critical flow | encrypted/secret stores only | never in clear logs | never share outside secured boundary |

## Redaction and Masking Baseline
Operational logs must not expose raw:
- bearer tokens and credential-like fields
- password/token/secret/jwt/cookie/api keys
- guest comment email fields (`guest_email`, `reporter_email`)
- raw IP addresses (default behavior is drop/mask)

Reference implementation baseline:
- `docs/LOG_CONTRACT.md`
- `docs/LOGGING_GUIDE.md`

## Retention Principles
- Keep the minimum retention needed for operations, security, and compliance.
- Log retention defaults follow `docs/LOG_RETENTION.md`:
  - hot window `14d`
  - archive `90d`
  - production local buffer `48h`
- Backup retention follows `docs/PRIVACY_RETENTION.md` and backup policy.

## Access Control Principles
- Least privilege by default.
- Role-bound data access (`public/member/moderator/admin/owner/ops/system`).
- Audit-required operations for privileged actions must stay traceable via `AUDIT_EVENTS.md`.

## Forbidden Data Patterns in Logs and Events
Never emit clear values for:
- `token`, `secret`, `password`, `authorization`, `api_key`, `jwt`, `cookie`
- `guest_email`, `reporter_email`
- raw authentication payload fragments

## M0 Privacy Guardrails
- No invasive tracking.
- Consent-first analytics expansion only.
- No fingerprinting or device-stable hidden identifiers.
- Metadata collection must remain minimal and purpose-bound.
