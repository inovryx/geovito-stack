# Geovito Privacy and Retention Policy (Operational)

## Data handling defaults
- Guest comment emails are private and never serialized to public responses.
- UGC/account deletion default policy is anonymize-on-delete (unless legal/ops requires hard delete).

## Audit log retention
- Audit logs are append-only and operationally critical.
- Retain according to security policy and compliance needs.
- Access restricted to admin/moderation operations.

## Backup retention
- Daily 14, weekly 8, monthly 12 (default).
- Encrypted at source before offsite upload.

## Logs and observability data
- Error/access logs retained for operational diagnosis.
- Avoid storing unnecessary personal content in logs.

## Account close/delete requests
- Requests are tracked and moderated.
- Decisions are auditable via moderation and audit-log actions.

## Incident data
- Emergency script operations include approver/reason metadata.
- Incident artifacts under `artifacts/emergency/` should be access-restricted.
