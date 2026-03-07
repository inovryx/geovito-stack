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
- Frontend critical auth/dashboard/account calls send `X-Request-Id`
- Scripts use `RUN_ID` and emit it as `request_id`

## Env toggles
- `LOG_CONTRACT_ENABLED=true`
- `LOG_CONTRACT_STDOUT=true`
- `LOG_CONTRACT_FILE_ENABLED=true`
- `LOG_CONTRACT_FILE_ROOT=logs/channels`
- `LOG_USER_REF_SALT=<secret-salt>`
- `LOG_REDACT_IP_MODE=drop|hash`

## Validation
Run:
- `bash tools/log_contract_smoke.sh`
- `bash tools/audit_log_smoke.sh`
