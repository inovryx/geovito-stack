# Log Retention Policy

## Locked defaults
- Prod local buffer: 48 hours
- Log VPS hot retention: 14 days
- Archive retention: 90 days (compressed)

## Current phase
This repo ships only foundation and templates.
Continuous log shipping remains disabled by default.

## Future rollout target
When log routing is enabled:
- split streams by channel (`app/security/moderation/audit/release/dr`)
- enforce rotation and retention on log VPS
- optionally export weekly archives to offsite storage
