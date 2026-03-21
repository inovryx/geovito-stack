# Geovito Log Contract

Geovito uses JSON lines (one JSON object per line) for contract logs.

## Required fields (locked)
- `ts`: ISO timestamp
- `env`: `dev|staging|prod`
- `channel`: `app|security|moderation|audit|release|dr`
- `level`: `debug|info|warn|error`
- `msg`: short human-readable message
- `service`: `astro|strapi|scripts|worker`
- `request_id`: correlation id (HTTP request id or script run id)
- `route_or_action`: route name or action name
- `status`: numeric status, nullable (`null` if not applicable)
- `latency_ms`: numeric latency, nullable (`null` if not applicable)
- `user_ref`: pseudonymous user reference, nullable (`null` if not applicable)
- `meta`: object for structured context (always object, can be empty)

## Channel mapping (locked)
- `app`: general app/runtime events
- `security`: auth, rate-limit, blocked access, guard failures
- `moderation`: report/comment/post/account-request moderation actions
- `audit`: privileged actions and policy changes
- `release`: deploy, gate, smoke pipeline events
- `dr`: backup/restore and restore freshness events

## Dual-write mode
Current transition is dual-write:
- Legacy domain logs stay under `logs/<domain>/*.jsonl`
- Contract logs are written under `logs/channels/*.jsonl` (or `LOG_CONTRACT_FILE_ROOT`)

## Redaction rules
Never log raw values for:
- authorization headers, cookies, password/token/secret/api keys/jwt
- guest email fields (`guest_email`, `reporter_email`)
- full IP addresses (default mode drops IP fields)

Script contract logs (`tools/lib_log_contract.sh`) and backend contract logs (`app/src/modules/domain-logging`) both apply protective redaction/masking in L0.

Config:
- `LOG_REDACT_IP_MODE=drop` (default)
- `LOG_REDACT_IP_MODE=hash` (explicit opt-in pseudonymized IP)
