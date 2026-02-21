#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STRAPI_BASE_URL="${STRAPI_BASE_URL:-http://127.0.0.1:1337}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/frontend/src/i18n}"
UI_REFERENCE_LOCALE="${UI_REFERENCE_LOCALE:-en}"
UI_LOCALE_PROGRESS_REPORT="${UI_LOCALE_PROGRESS_REPORT:-$ROOT_DIR/artifacts/ui-locale-progress.json}"
SECRET_FILE="${UI_LOCALE_SECRET_FILE:-$HOME/.config/geovito/ui_locale.env}"

if [[ "$OUTPUT_DIR" = /* ]]; then
  if [[ "$OUTPUT_DIR" == "$ROOT_DIR/"* ]]; then
    CONTAINER_OUTPUT_DIR="/work/${OUTPUT_DIR#"$ROOT_DIR/"}"
  else
    echo "ERROR: OUTPUT_DIR must be under $ROOT_DIR when absolute."
    exit 1
  fi
else
  CONTAINER_OUTPUT_DIR="/work/$OUTPUT_DIR"
  OUTPUT_DIR="$ROOT_DIR/$OUTPUT_DIR"
fi

if [[ "$UI_LOCALE_PROGRESS_REPORT" = /* ]]; then
  if [[ "$UI_LOCALE_PROGRESS_REPORT" == "$ROOT_DIR/"* ]]; then
    CONTAINER_PROGRESS_REPORT="/work/${UI_LOCALE_PROGRESS_REPORT#"$ROOT_DIR/"}"
  else
    echo "ERROR: UI_LOCALE_PROGRESS_REPORT must be under $ROOT_DIR when absolute."
    exit 1
  fi
else
  CONTAINER_PROGRESS_REPORT="/work/$UI_LOCALE_PROGRESS_REPORT"
  UI_LOCALE_PROGRESS_REPORT="$ROOT_DIR/$UI_LOCALE_PROGRESS_REPORT"
fi

if [[ -z "${STRAPI_API_TOKEN:-}" && -f "$SECRET_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$SECRET_FILE"
  set +a
fi

if [[ -z "${STRAPI_API_TOKEN:-}" ]]; then
  echo "ERROR: STRAPI_API_TOKEN is required for ui-locale export."
  echo "Hint: bash tools/ui_locale_secret_init.sh"
  exit 1
fi

if [[ "${STRAPI_API_TOKEN}" == *"REPLACE_WITH_REAL_STRAPI_API_TOKEN"* ]]; then
  echo "ERROR: placeholder token found in $SECRET_FILE"
  echo "Edit file and set real token: nano \"$SECRET_FILE\""
  exit 1
fi

docker run --rm \
  --network host \
  -v "$ROOT_DIR:/work" \
  -w /work \
  -e STRAPI_BASE_URL="$STRAPI_BASE_URL" \
  -e STRAPI_API_TOKEN="$STRAPI_API_TOKEN" \
  -e OUTPUT_DIR="$CONTAINER_OUTPUT_DIR" \
  -e UI_REFERENCE_LOCALE="$UI_REFERENCE_LOCALE" \
  -e UI_LOCALE_PROGRESS_REPORT="$CONTAINER_PROGRESS_REPORT" \
  node:20-alpine \
  node tools/export_ui_locales.js
