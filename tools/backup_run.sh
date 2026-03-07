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

BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/geovito}"
BACKUP_R2_BUCKET="${BACKUP_R2_BUCKET:-}"
BACKUP_R2_PREFIX="${BACKUP_R2_PREFIX:-geovito-prod}"
BACKUP_R2_ENDPOINT="${BACKUP_R2_ENDPOINT:-}"
BACKUP_R2_ACCESS_KEY_ID="${BACKUP_R2_ACCESS_KEY_ID:-}"
BACKUP_R2_SECRET_ACCESS_KEY="${BACKUP_R2_SECRET_ACCESS_KEY:-}"
BACKUP_AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"
STAMP="${BACKUP_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"

pass() { echo "PASS: $1"; }
fail() {
  echo "FAIL: $1"
  gv_log_contract_emit "dr" "error" "Backup run failed" "dr.backup_run.error" 1 0 "$1"
  exit 1
}

command -v age >/dev/null 2>&1 || fail "age binary is required"
command -v aws >/dev/null 2>&1 || fail "aws cli is required"
[[ -n "$BACKUP_R2_BUCKET" ]] || fail "BACKUP_R2_BUCKET is required"
[[ -n "$BACKUP_R2_ENDPOINT" ]] || fail "BACKUP_R2_ENDPOINT is required"
[[ -n "$BACKUP_AGE_RECIPIENT" ]] || fail "BACKUP_AGE_RECIPIENT is required"
[[ -n "$BACKUP_R2_ACCESS_KEY_ID" ]] || fail "BACKUP_R2_ACCESS_KEY_ID is required"
[[ -n "$BACKUP_R2_SECRET_ACCESS_KEY" ]] || fail "BACKUP_R2_SECRET_ACCESS_KEY is required"

export AWS_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY"
export AWS_EC2_METADATA_DISABLED=true
gv_log_contract_emit "dr" "info" "Backup run started" "dr.backup_run.start" 0 0 "stamp=${STAMP};bucket=${BACKUP_R2_BUCKET}"

export BACKUP_STAMP="$STAMP"
bash tools/backup_create.sh

SNAPSHOT_DIR="${BACKUP_ROOT}/${STAMP}"
[[ -d "$SNAPSHOT_DIR" ]] || fail "snapshot directory missing: $SNAPSHOT_DIR"

BUNDLE_PATH="${SNAPSHOT_DIR}/snapshot.bundle.tar.gz"
ENCRYPTED_PATH="${BUNDLE_PATH}.age"
MANIFEST_PATH="${SNAPSHOT_DIR}/manifest.json"

(
  cd "$SNAPSHOT_DIR"
  tar -czf "$(basename "$BUNDLE_PATH")" postgres.sql uploads.tgz meta.txt SHA256SUMS
)
pass "bundle archive created"

age -r "$BACKUP_AGE_RECIPIENT" -o "$ENCRYPTED_PATH" "$BUNDLE_PATH"
pass "bundle encrypted with age"

bundle_sha="$(sha256sum "$ENCRYPTED_PATH" | awk '{print $1}')"
cat > "$MANIFEST_PATH" <<JSON
{
  "stamp": "${STAMP}",
  "generated_at_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "git_sha7": "$(git rev-parse --short=7 HEAD)",
  "bundle_file": "$(basename "$ENCRYPTED_PATH")",
  "bundle_sha256": "${bundle_sha}",
  "retention": {
    "daily": ${BACKUP_RETENTION_DAILY:-14},
    "weekly": ${BACKUP_RETENTION_WEEKLY:-8},
    "monthly": ${BACKUP_RETENTION_MONTHLY:-12}
  }
}
JSON
pass "manifest written"

r2_base="s3://${BACKUP_R2_BUCKET}/${BACKUP_R2_PREFIX}/${STAMP}"
aws --endpoint-url "$BACKUP_R2_ENDPOINT" \
  --region auto \
  --no-cli-pager \
  s3 cp "$ENCRYPTED_PATH" "${r2_base}/$(basename "$ENCRYPTED_PATH")" \
  --content-type application/octet-stream >/dev/null
aws --endpoint-url "$BACKUP_R2_ENDPOINT" \
  --region auto \
  --no-cli-pager \
  s3 cp "$MANIFEST_PATH" "${r2_base}/manifest.json" \
  --content-type application/json >/dev/null
pass "offsite upload completed"
gv_log_contract_emit "dr" "info" "Backup run completed" "dr.backup_run.complete" 0 0 "stamp=${STAMP};r2_prefix=${BACKUP_R2_PREFIX}"

echo "=============================================================="
echo "BACKUP RUN: PASS"
echo "snapshot=${SNAPSHOT_DIR}"
echo "r2_path=${r2_base}"
echo "next= BACKUP_VERIFY_OFFSITE=true bash tools/backup_verify.sh ${STAMP}"
echo "=============================================================="
