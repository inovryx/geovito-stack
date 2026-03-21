# Audit Events (Required)

The following actions must produce both:
1) append-only audit DB record (`api::audit-log.audit-log`)
2) contract log line with `channel=audit`

## Required action set
- `community.settings.update`
- `safety.kill_switch.apply`
- `safety.kill_switch.clear`
- `moderation.content_report.set`
- `moderation.account_request.set`
- `moderation.blog_post.set`
- `gate.go_live_full.override`

## Payload guidance
Store only operational metadata:
- actor role / actor id (or pseudonymous actor)
- target type / target ref
- before/after summary

Do not include secrets, tokens, guest emails, or raw credentials.

## Smoke modes
- Quick mode (default):
  - `bash tools/audit_log_smoke.sh`
  - fast deterministic checks for core required actions
- Strict mode (opt-in):
  - `AUDIT_SMOKE_STRICT=true bash tools/audit_log_smoke.sh`
  - validates full required action set against:
    - append-only audit DB (`api::audit-log.audit-log`)
    - contract audit channel (`logs/channels/audit.jsonl`)

Environment knobs:
- `AUDIT_SMOKE_STRICT=false|true`
- `AUDIT_REQUIRED_ACTIONS` (quick mode action list)
- `AUDIT_REQUIRED_ACTIONS_STRICT` (strict mode action list, full set default)
