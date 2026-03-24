#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${FRONTEND_DIR:-$ROOT_DIR/frontend}"
ARTIFACT_DIR="${I18N_SITE_AUDIT_ARTIFACT_DIR:-$ROOT_DIR/artifacts/i18n}"
STRICT_MISSING="${I18N_SITE_AUDIT_STRICT_MISSING:-1}"
FAIL_ON_MISMATCH="${I18N_SITE_AUDIT_FAIL_ON_MISMATCH:-0}"
NODE_IMAGE="${I18N_AUDIT_NODE_IMAGE:-node:20-alpine}"

echo "=============================================================="
echo "GEOVITO I18N SITE LANGUAGE AUDIT"
echo "frontend_dir=${FRONTEND_DIR}"
echo "artifact_dir=${ARTIFACT_DIR}"
echo "strict_missing=${STRICT_MISSING}"
echo "fail_on_mismatch=${FAIL_ON_MISMATCH}"
echo "=============================================================="

if [[ ! -d "$FRONTEND_DIR/src/i18n" ]]; then
  echo "FAIL: i18n directory missing -> $FRONTEND_DIR/src/i18n"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "FAIL: docker command is required"
  exit 1
fi

mkdir -p "$ARTIFACT_DIR"

set +e
AUDIT_OUTPUT="$(
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -e FRONTEND_DIR_IN_CONTAINER="/frontend" \
    -e ARTIFACT_DIR_IN_CONTAINER="/repo/artifacts/i18n" \
    -e STRICT_MISSING="$STRICT_MISSING" \
    -e FAIL_ON_MISMATCH="$FAIL_ON_MISMATCH" \
    -v "$FRONTEND_DIR":/frontend \
    -v "$ROOT_DIR":/repo \
    -w /repo \
    "$NODE_IMAGE" \
    node tools/i18n_site_language_audit.mjs 2>&1
)"
STATUS=$?
set -e

echo "$AUDIT_OUTPUT"

if [[ "$STATUS" -ne 0 ]]; then
  echo "=============================================================="
  echo "I18N SITE LANGUAGE AUDIT: FAIL"
  echo "=============================================================="
  exit "$STATUS"
fi

echo "=============================================================="
echo "I18N SITE LANGUAGE AUDIT: PASS"
echo "=============================================================="
