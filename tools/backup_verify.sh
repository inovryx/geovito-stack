#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-$HOME/.config/geovito/backup.env}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/geovito}"
REQUESTED_STAMP="${1:-}"
BACKUP_VERIFY_OFFSITE="${BACKUP_VERIFY_OFFSITE:-false}"
BACKUP_R2_BUCKET="${BACKUP_R2_BUCKET:-}"
BACKUP_R2_PREFIX="${BACKUP_R2_PREFIX:-geovito-prod}"
BACKUP_R2_ENDPOINT="${BACKUP_R2_ENDPOINT:-}"
BACKUP_R2_ACCESS_KEY_ID="${BACKUP_R2_ACCESS_KEY_ID:-}"
BACKUP_R2_SECRET_ACCESS_KEY="${BACKUP_R2_SECRET_ACCESS_KEY:-}"

if [[ -f "$BACKUP_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$BACKUP_ENV_FILE"
fi

BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/geovito}"

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1"
  exit 1
}

if [[ ! -d "$BACKUP_ROOT" ]]; then
  fail "backup root does not exist: $BACKUP_ROOT"
fi

if [[ -n "$REQUESTED_STAMP" ]]; then
  SNAPSHOT_DIR="${BACKUP_ROOT}/${REQUESTED_STAMP}"
else
  SNAPSHOT_DIR="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | tail -n 1)"
  SNAPSHOT_DIR="${BACKUP_ROOT}/${SNAPSHOT_DIR}"
fi

echo "=============================================================="
echo "GEOVITO BACKUP VERIFY"
echo "snapshot=${SNAPSHOT_DIR}"
echo "=============================================================="

[[ -d "$SNAPSHOT_DIR" ]] || fail "snapshot not found"

for file in postgres.sql uploads.tgz meta.txt SHA256SUMS; do
  [[ -f "${SNAPSHOT_DIR}/${file}" ]] || fail "missing file: ${SNAPSHOT_DIR}/${file}"
done

(
  cd "$SNAPSHOT_DIR"
  sha256sum -c SHA256SUMS >/dev/null
)
pass "checksum validation passed"

if ! head -n 5 "${SNAPSHOT_DIR}/postgres.sql" | grep -q '^--'; then
  fail "postgres dump header looks invalid"
fi
pass "postgres dump header looks valid"

tar -tzf "${SNAPSHOT_DIR}/uploads.tgz" >/dev/null
pass "uploads archive can be listed"

if [[ "${BACKUP_VERIFY_OFFSITE}" == "true" ]]; then
  command -v aws >/dev/null 2>&1 || fail "aws cli is required for BACKUP_VERIFY_OFFSITE=true"
  [[ -n "${BACKUP_R2_BUCKET}" ]] || fail "BACKUP_R2_BUCKET is required for offsite verify"
  [[ -n "${BACKUP_R2_ENDPOINT}" ]] || fail "BACKUP_R2_ENDPOINT is required for offsite verify"
  [[ -n "${BACKUP_R2_ACCESS_KEY_ID}" ]] || fail "BACKUP_R2_ACCESS_KEY_ID is required for offsite verify"
  [[ -n "${BACKUP_R2_SECRET_ACCESS_KEY}" ]] || fail "BACKUP_R2_SECRET_ACCESS_KEY is required for offsite verify"

  export AWS_ACCESS_KEY_ID="${BACKUP_R2_ACCESS_KEY_ID}"
  export AWS_SECRET_ACCESS_KEY="${BACKUP_R2_SECRET_ACCESS_KEY}"
  export AWS_EC2_METADATA_DISABLED=true

  stamp="$(basename "${SNAPSHOT_DIR}")"
  remote_base="s3://${BACKUP_R2_BUCKET}/${BACKUP_R2_PREFIX}/${stamp}"
  aws --endpoint-url "${BACKUP_R2_ENDPOINT}" --region auto --no-cli-pager \
    s3 ls "${remote_base}/manifest.json" >/dev/null
  pass "offsite manifest exists (${remote_base}/manifest.json)"

  aws --endpoint-url "${BACKUP_R2_ENDPOINT}" --region auto --no-cli-pager \
    s3 ls "${remote_base}/snapshot.bundle.tar.gz.age" >/dev/null
  pass "offsite encrypted bundle exists (${remote_base}/snapshot.bundle.tar.gz.age)"
fi

echo "=============================================================="
echo "BACKUP VERIFY: PASS"
echo "snapshot=${SNAPSHOT_DIR}"
echo "=============================================================="
