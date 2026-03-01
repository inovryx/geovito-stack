#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-$HOME/.config/geovito/backup.env}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/geovito}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="${BACKUP_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
SNAPSHOT_DIR="${BACKUP_ROOT}/${STAMP}"

if [[ -f "$BACKUP_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$BACKUP_ENV_FILE"
fi

BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/geovito}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
SNAPSHOT_DIR="${BACKUP_ROOT}/${STAMP}"

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1"
  exit 1
}

echo "=============================================================="
echo "GEOVITO BACKUP CREATE"
echo "snapshot=${SNAPSHOT_DIR}"
echo "keep_days=${BACKUP_KEEP_DAYS}"
echo "=============================================================="

if ! [[ "$BACKUP_KEEP_DAYS" =~ ^[0-9]+$ ]]; then
  fail "BACKUP_KEEP_DAYS must be a non-negative integer"
fi

if [[ -e "$SNAPSHOT_DIR" ]]; then
  fail "snapshot already exists: $SNAPSHOT_DIR"
fi

mkdir -p "$SNAPSHOT_DIR"
docker compose up -d db strapi >/dev/null

DB_DUMP_FILE="${SNAPSHOT_DIR}/postgres.sql"
UPLOADS_ARCHIVE_FILE="${SNAPSHOT_DIR}/uploads.tgz"
META_FILE="${SNAPSHOT_DIR}/meta.txt"
SUMS_FILE="${SNAPSHOT_DIR}/SHA256SUMS"

docker compose exec -T db sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$DB_DUMP_FILE"

pass "postgres dump exported -> ${DB_DUMP_FILE}"

docker compose exec -T strapi sh -lc \
  'tar -C /opt/app/public -czf - uploads' \
  > "$UPLOADS_ARCHIVE_FILE"

pass "uploads archive exported -> ${UPLOADS_ARCHIVE_FILE}"

cat > "$META_FILE" <<EOF
generated_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
git_sha=$(git rev-parse --short=12 HEAD)
compose_project=$(basename "$ROOT_DIR")
db_dump=postgres.sql
uploads_archive=uploads.tgz
EOF

(
  cd "$SNAPSHOT_DIR"
  sha256sum postgres.sql uploads.tgz meta.txt > SHA256SUMS
)

pass "checksum manifest written -> ${SUMS_FILE}"

if [[ "$BACKUP_KEEP_DAYS" -gt 0 ]] && [[ -d "$BACKUP_ROOT" ]]; then
  while IFS= read -r stale_dir; do
    [[ -z "$stale_dir" ]] && continue
    rm -rf -- "$stale_dir"
    echo "INFO: pruned old snapshot -> ${stale_dir}"
  done < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$BACKUP_KEEP_DAYS" -print | sort)
fi

echo "=============================================================="
echo "BACKUP CREATE: PASS"
echo "snapshot=${SNAPSHOT_DIR}"
echo "next= bash tools/backup_verify.sh ${STAMP}"
echo "=============================================================="
