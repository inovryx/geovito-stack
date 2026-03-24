# Launch Kit / Deployment Profile System (M0)

## Purpose
Launch Kit separates reusable product core from project identity and deploy profile.
It enables faster bootstrap for future projects (for example Pet) without changing runtime defaults.

M0 is template and tooling foundation only:
- optional-by-default
- no runtime behavior change
- no migration or gate coupling

## Files
- `templates/project.identity.json`
- `templates/project.local.env`
- `templates/project.launch.env`
- `tools/launch_profile_validate.sh`
- `tools/dns_checklist_print.sh`

## Profile Model
1. Identity profile (`project.identity.json`)
   - site identity, brand basics, project type
2. Local profile (`project.local.env`)
   - local app/cms/smtp/storage defaults
3. Launch profile (`project.launch.env`)
   - prod/staging/cms domains
   - cloudflare zone/account placeholders
   - smtp mode
   - storage targets
   - analytics placeholders

## Quick Start
1. Copy templates into a host-local profile folder:
   - `~/.config/<project>/identity.json`
   - `~/.config/<project>/local.env`
   - `~/.config/<project>/launch.env`
2. Replace non-secret project values.
3. Keep secrets as host-local overrides only.
4. Validate profile set:
   - `bash tools/launch_profile_validate.sh`
5. Print DNS launch checklist:
   - `bash tools/dns_checklist_print.sh`

Optional custom paths:
- `LAUNCH_PROFILE_DIR=/path/to/profile bash tools/launch_profile_validate.sh`
- `LAUNCH_PROFILE_DIR=/path/to/profile bash tools/dns_checklist_print.sh`

## Generic -> Geovito Mapping Notes
Launch Kit keys stay generic-first. Runtime aliasing is intentionally not introduced in M0.

| Launch Kit key | Geovito runtime analogue |
| --- | --- |
| `LAUNCH_PROD_APP_DOMAIN` | `PUBLIC_SITE_URL` host |
| `LAUNCH_PROD_CMS_DOMAIN` | `SERVER_URL` / `STRAPI_URL` host |
| `LAUNCH_STAGING_APP_DOMAIN` | `STAGING_BASE_URL` host |
| `LAUNCH_STAGING_CMS_DOMAIN` | `STAGING_API_BASE` host |
| `LAUNCH_SMTP_MODE` | `EMAIL_PROVIDER` + staging mailsink policy |
| `LAUNCH_STORAGE_PRIMARY` | backup/storage target class (R2/local/etc.) |
| `LAUNCH_ANALYTICS_*` | Pages analytics/tag manager env placeholders |

## Security Rules (Locked)
- Never commit real secrets.
- Template secrets must remain placeholders (`REPLACE_WITH_*`).
- Use host-local secret files under `~/.config/*` with `chmod 600`.
- Profile validation must fail on missing non-secret required values.
- Profile validation allows placeholder values for secret and analytics IDs.

## Out of Scope (M0)
- Automatic runtime loading of launch profiles
- Secret manager integration
- DNS mutation/automation
- Deploy orchestration changes
