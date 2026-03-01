#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-$HOME/.config/geovito/backup.env}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/geovito}"
REQUESTED_STAMP="${1:-}"

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

echo "=============================================================="
echo "BACKUP VERIFY: PASS"
echo "snapshot=${SNAPSHOT_DIR}"
echo "=============================================================="
