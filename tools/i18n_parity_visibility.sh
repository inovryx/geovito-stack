#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${FRONTEND_DIR:-$ROOT_DIR/frontend}"
ARTIFACT_DIR="${I18N_PARITY_ARTIFACT_DIR:-$ROOT_DIR/artifacts/i18n}"
STRICT_PARITY="${I18N_PARITY_STRICT:-1}"
NODE_IMAGE="${I18N_AUDIT_NODE_IMAGE:-node:20-alpine}"

echo "=============================================================="
echo "GEOVITO I18N PARITY VISIBILITY"
echo "frontend_dir=${FRONTEND_DIR}"
echo "artifact_dir=${ARTIFACT_DIR}"
echo "strict_parity=${STRICT_PARITY}"
echo "=============================================================="

if [[ ! -f "$FRONTEND_DIR/src/i18n/en.json" ]]; then
  echo "FAIL: en.json missing -> $FRONTEND_DIR/src/i18n/en.json"
  exit 1
fi

for locale in tr fr; do
  if [[ ! -f "$FRONTEND_DIR/src/i18n/${locale}.json" ]]; then
    echo "FAIL: locale file missing -> $FRONTEND_DIR/src/i18n/${locale}.json"
    exit 1
  fi
done

if ! command -v docker >/dev/null 2>&1; then
  echo "FAIL: docker command is required"
  exit 1
fi

mkdir -p "$ARTIFACT_DIR"

set +e
PARITY_OUTPUT="$(
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -e FRONTEND_DIR_IN_CONTAINER="/frontend" \
    -e ARTIFACT_DIR_IN_CONTAINER="/repo/artifacts/i18n" \
    -e STRICT_PARITY="$STRICT_PARITY" \
    -v "$FRONTEND_DIR":/frontend \
    -v "$ROOT_DIR":/repo \
    -w /repo \
    "$NODE_IMAGE" \
    node tools/i18n_parity_visibility.mjs 2>&1
)"
STATUS=$?
set -e

echo "$PARITY_OUTPUT"

if [[ "$STATUS" -ne 0 ]]; then
  echo "=============================================================="
  echo "I18N PARITY VISIBILITY: FAIL"
  echo "=============================================================="
  exit "$STATUS"
fi

echo "=============================================================="
echo "I18N PARITY VISIBILITY: PASS"
echo "=============================================================="
