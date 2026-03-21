# Logging Guide

## Principle
Use structured contract logging, not ad-hoc `console.log` for operational events.

## Strapi usage
Primary entry point:
- `app/src/modules/domain-logging/index.js`
- call `log(domain, level, event, message, meta, context)`

Contract logger runs in dual-write mode automatically.

## Request correlation
- Incoming request id header: `X-Request-Id`
- Strapi middleware sets/returns `X-Request-Id`
- Frontend critical auth/dashboard/account calls send `X-Request-Id` (no full frontend sweep in L0)
- Scripts use `RUN_ID` and emit it as `request_id` through `tools/lib_log_contract.sh`
- Backend log flow (`requestid` middleware + access/audit logging) keeps `ctx.state.requestId` as source of truth

## Env toggles
- `LOG_CONTRACT_ENABLED=true`
- `LOG_CONTRACT_STDOUT=true`
- `LOG_CONTRACT_FILE_ENABLED=true`
- `LOG_CONTRACT_FILE_ROOT=logs/channels`
- `LOG_USER_REF_SALT=<secret-salt>`
- `LOG_REDACT_IP_MODE=drop|hash`
- `AUDIT_SMOKE_STRICT=false|true`
- `AUDIT_REQUIRED_ACTIONS=<quick-actions-csv>`
- `AUDIT_REQUIRED_ACTIONS_STRICT=<full-required-actions-csv>`

## Redaction baseline
Contract logs must not expose:
- bearer tokens, api keys, jwt, authorization/cookie/password/secret values
- guest comment emails (`guest_email`, `reporter_email`)
- full IP addresses in clear text

L0 behavior is protective redaction: log line is kept, sensitive parts are masked/redacted.

## Validation
Run:
- `bash tools/log_contract_smoke.sh`
- `bash tools/audit_log_smoke.sh`
- `AUDIT_SMOKE_STRICT=true bash tools/audit_log_smoke.sh`
