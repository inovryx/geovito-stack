# Geovito Security Model (Hardening Pack)

## Access controls
- Production and staging protected by Cloudflare Access.
- Admin/moderation access must enforce MFA at Access policy layer.
- App-level role checks remain backend-enforced.

## Sensitive operations requiring audit logs
- community settings updates
- moderation decisions (reports/account requests/blog posts/comments)
- kill switch apply/clear
- submitted visibility freeze/restore
- go-live emergency overrides

## Audit log design
- Content type: `api::audit-log.audit-log`
- Append-only (update/delete blocked by lifecycle hooks).
- No public API surface exposed for audit-log.

## Secrets separation
- Separate credentials for prod and staging.
- No secrets in git-tracked files.
- Runtime env files under `~/.config/geovito/*.env` with `chmod 600`.

## Emergency controls
- Kill switch is backend-enforced, not UI-only.
- Script operations require incident metadata:
  - `INCIDENT_ID`
  - `APPROVER_EMAIL`
  - `REASON`

## Minimum controls checklist
- Cloudflare Access MFA policy enabled for cms/admin surfaces
- Health token enabled for protected health endpoints
- DR keys and backup keys rotated periodically
