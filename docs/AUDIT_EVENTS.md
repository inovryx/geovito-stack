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
