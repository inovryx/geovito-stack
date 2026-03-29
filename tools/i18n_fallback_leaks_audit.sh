#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${FRONTEND_DIR:-$ROOT_DIR/frontend}"
ARTIFACT_DIR="${I18N_FALLBACK_AUDIT_ARTIFACT_DIR:-$ROOT_DIR/artifacts/i18n}"
FAIL_ON_MISSING_EN="${I18N_FALLBACK_AUDIT_FAIL_ON_MISSING_EN:-0}"
FAIL_ON_VISIBLE_LEAK="${I18N_FALLBACK_AUDIT_FAIL_ON_VISIBLE_LEAK:-0}"
FAIL_ON_PARITY_GAP="${I18N_FALLBACK_AUDIT_FAIL_ON_PARITY_GAP:-0}"
NODE_IMAGE="${I18N_AUDIT_NODE_IMAGE:-node:20-alpine}"

echo "=============================================================="
echo "GEOVITO I18N FALLBACK LEAKS AUDIT"
echo "frontend_dir=${FRONTEND_DIR}"
echo "artifact_dir=${ARTIFACT_DIR}"
echo "fail_on_missing_en=${FAIL_ON_MISSING_EN}"
echo "fail_on_visible_leak=${FAIL_ON_VISIBLE_LEAK}"
echo "fail_on_parity_gap=${FAIL_ON_PARITY_GAP}"
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
    -e I18N_FALLBACK_AUDIT_FAIL_ON_MISSING_EN="$FAIL_ON_MISSING_EN" \
    -e I18N_FALLBACK_AUDIT_FAIL_ON_VISIBLE_LEAK="$FAIL_ON_VISIBLE_LEAK" \
    -e I18N_FALLBACK_AUDIT_FAIL_ON_PARITY_GAP="$FAIL_ON_PARITY_GAP" \
    -v "$FRONTEND_DIR":/frontend \
    -v "$ROOT_DIR":/repo \
    -w /repo \
    "$NODE_IMAGE" \
    node tools/i18n_fallback_leaks_audit.mjs 2>&1
)"
STATUS=$?
set -e

echo "$AUDIT_OUTPUT"

if [[ "$STATUS" -ne 0 ]]; then
  echo "=============================================================="
  echo "I18N FALLBACK LEAKS AUDIT: FAIL"
  echo "=============================================================="
  exit "$STATUS"
fi

echo "=============================================================="
echo "I18N FALLBACK LEAKS AUDIT: PASS"
echo "=============================================================="
