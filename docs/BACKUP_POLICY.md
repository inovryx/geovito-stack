# Geovito Backup Policy (3-2-1)

## Backup targets
- PostgreSQL database dump
- Uploads/media archive
- backup metadata + checksums

## Storage strategy
- Local snapshot under `BACKUP_ROOT`
- Offsite encrypted copy in Cloudflare R2
- Optional additional copy on secondary host (future extension)

## Encryption
- Backup bundle is encrypted with `age` before offsite upload.
- Public recipient key: `BACKUP_AGE_RECIPIENT`
- Private key file: `BACKUP_AGE_KEY_FILE` (never committed)

## Retention defaults
- daily: 14
- weekly: 8
- monthly: 12

Config lives in `~/.config/geovito/backup.env`.

## Required environment variables
- `BACKUP_R2_BUCKET`
- `BACKUP_R2_PREFIX`
- `BACKUP_R2_ENDPOINT`
- `BACKUP_R2_ACCESS_KEY_ID`
- `BACKUP_R2_SECRET_ACCESS_KEY`
- `BACKUP_AGE_RECIPIENT`
- `BACKUP_AGE_KEY_FILE`

## Operational commands
- initialize env file:
  - `bash tools/backup_env_init.sh`
- local + encrypted offsite backup:
  - `bash tools/backup_run.sh`
- integrity and offsite verify:
  - `BACKUP_VERIFY_OFFSITE=true bash tools/backup_verify.sh`

## Compliance notes
- Credentials and keys must be stored outside repo.
- Rotate R2 and age keys periodically.
- Keep backup access scoped to ops principals only.
