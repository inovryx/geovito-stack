#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/tools/lib_log_contract.sh"
gv_log_contract_init "scripts"

BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-$HOME/.config/geovito/backup.env}"
if [[ -f "$BACKUP_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$BACKUP_ENV_FILE"
fi

STAMP="${1:-${BACKUP_STAMP:-}}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/geovito}"
BACKUP_R2_BUCKET="${BACKUP_R2_BUCKET:-}"
BACKUP_R2_PREFIX="${BACKUP_R2_PREFIX:-geovito-prod}"
BACKUP_R2_ENDPOINT="${BACKUP_R2_ENDPOINT:-}"
BACKUP_R2_ACCESS_KEY_ID="${BACKUP_R2_ACCESS_KEY_ID:-}"
BACKUP_R2_SECRET_ACCESS_KEY="${BACKUP_R2_SECRET_ACCESS_KEY:-}"
BACKUP_AGE_KEY_FILE="${BACKUP_AGE_KEY_FILE:-}"
RESTORE_TARGET="${RESTORE_TARGET:-staging}"
WORK_DIR="${RESTORE_WORK_DIR:-${BACKUP_ROOT}/_restore/${STAMP}}"
RESTORE_RUN_RESET_DB="${RESTORE_RUN_RESET_DB:-true}"
RESTORE_RUN_ALLOW_NON_STAGING_RESET="${RESTORE_RUN_ALLOW_NON_STAGING_RESET:-false}"

pass() { echo "PASS: $1"; }
fail() {
  echo "FAIL: $1"
  gv_log_contract_emit "dr" "error" "Restore run failed" "dr.restore_run.error" 1 0 "$1"
  exit 1
}

[[ -n "$STAMP" ]] || fail "backup stamp is required (arg1 or BACKUP_STAMP)"
[[ -n "$BACKUP_R2_BUCKET" ]] || fail "BACKUP_R2_BUCKET is required"
[[ -n "$BACKUP_R2_ENDPOINT" ]] || fail "BACKUP_R2_ENDPOINT is required"
[[ -n "$BACKUP_R2_ACCESS_KEY_ID" ]] || fail "BACKUP_R2_ACCESS_KEY_ID is required"
[[ -n "$BACKUP_R2_SECRET_ACCESS_KEY" ]] || fail "BACKUP_R2_SECRET_ACCESS_KEY is required"
[[ -n "$BACKUP_AGE_KEY_FILE" ]] || fail "BACKUP_AGE_KEY_FILE is required"
[[ -f "$BACKUP_AGE_KEY_FILE" ]] || fail "BACKUP_AGE_KEY_FILE not found"
command -v age >/dev/null 2>&1 || fail "age binary is required"
command -v aws >/dev/null 2>&1 || fail "aws cli is required"

export AWS_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY"
export AWS_EC2_METADATA_DISABLED=true
gv_log_contract_emit "dr" "info" "Restore run started" "dr.restore_run.start" 0 0 "stamp=${STAMP};target=${RESTORE_TARGET}"

mkdir -p "$WORK_DIR"

remote_base="s3://${BACKUP_R2_BUCKET}/${BACKUP_R2_PREFIX}/${STAMP}"
enc_file="${WORK_DIR}/snapshot.bundle.tar.gz.age"
bundle_file="${WORK_DIR}/snapshot.bundle.tar.gz"
manifest_file="${WORK_DIR}/manifest.json"

aws --endpoint-url "$BACKUP_R2_ENDPOINT" --region auto --no-cli-pager s3 cp "${remote_base}/snapshot.bundle.tar.gz.age" "$enc_file" >/dev/null
aws --endpoint-url "$BACKUP_R2_ENDPOINT" --region auto --no-cli-pager s3 cp "${remote_base}/manifest.json" "$manifest_file" >/dev/null
pass "downloaded encrypted snapshot"

age --decrypt -i "$BACKUP_AGE_KEY_FILE" -o "$bundle_file" "$enc_file"
pass "decrypted snapshot bundle"

mkdir -p "${WORK_DIR}/extract"
tar -xzf "$bundle_file" -C "${WORK_DIR}/extract"
pass "extracted snapshot bundle"

for file in postgres.sql uploads.tgz meta.txt SHA256SUMS; do
  [[ -f "${WORK_DIR}/extract/${file}" ]] || fail "missing extracted file: ${file}"
done

(
  cd "${WORK_DIR}/extract"
  sha256sum -c SHA256SUMS >/dev/null
)
pass "checksum verified after restore download"

wait_for_db_ready() {
  local tries=0
  local max_tries=30
  while (( tries < max_tries )); do
    if docker compose exec -T db sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" >/dev/null 2>&1'; then
      return 0
    fi
    tries=$((tries + 1))
    sleep 2
  done
  return 1
}

docker compose up -d db >/dev/null
wait_for_db_ready || fail "database is not ready for restore"

if [[ "$RESTORE_RUN_RESET_DB" == "true" ]]; then
  if [[ "$RESTORE_TARGET" != "staging" && "$RESTORE_RUN_ALLOW_NON_STAGING_RESET" != "true" ]]; then
    fail "refusing schema reset for non-staging target (${RESTORE_TARGET}); set RESTORE_RUN_ALLOW_NON_STAGING_RESET=true to proceed"
  fi
  docker compose exec -T db sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO \"$POSTGRES_USER\"; GRANT ALL ON SCHEMA public TO PUBLIC;"' >/dev/null
  pass "database schema reset"
fi

cat "${WORK_DIR}/extract/postgres.sql" | docker compose exec -T db sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null
pass "database restored"

docker compose up -d strapi >/dev/null
cat "${WORK_DIR}/extract/uploads.tgz" | docker compose exec -T strapi sh -lc 'rm -rf /opt/app/public/uploads && tar -C /opt/app/public -xzf -' >/dev/null
pass "uploads restored"

mkdir -p artifacts/dr
cat > artifacts/dr/restore-last.json <<JSON
{
  "status": "success",
  "restore_target": "${RESTORE_TARGET}",
  "backup_stamp": "${STAMP}",
  "restored_at_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "git_sha7": "$(git rev-parse --short=7 HEAD)",
  "work_dir": "${WORK_DIR}"
}
JSON
pass "restore evidence updated"
gv_log_contract_emit "dr" "info" "Restore run completed" "dr.restore_run.complete" 0 0 "stamp=${STAMP};target=${RESTORE_TARGET}"

echo "=============================================================="
echo "RESTORE RUN: PASS"
echo "target=${RESTORE_TARGET}"
echo "backup_stamp=${STAMP}"
echo "next= BACKUP_STAMP=${STAMP} RESTORE_TARGET=${RESTORE_TARGET} bash tools/restore_smoke.sh"
echo "=============================================================="
