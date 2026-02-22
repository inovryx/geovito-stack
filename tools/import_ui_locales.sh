#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STRAPI_BASE_URL="${STRAPI_BASE_URL:-http://127.0.0.1:1337}"
INPUT_DIR="${INPUT_DIR:-$ROOT_DIR/artifacts/ui-locales}"
UI_REFERENCE_LOCALE="${UI_REFERENCE_LOCALE:-en}"
SECRET_FILE="${UI_LOCALE_SECRET_FILE:-$HOME/.config/geovito/ui_locale.env}"

if [[ "$INPUT_DIR" = /* ]]; then
  if [[ "$INPUT_DIR" == "$ROOT_DIR/"* ]]; then
    CONTAINER_INPUT_DIR="/work/${INPUT_DIR#"$ROOT_DIR/"}"
  else
    echo "ERROR: INPUT_DIR must be under $ROOT_DIR when absolute."
    exit 1
  fi
else
  CONTAINER_INPUT_DIR="/work/$INPUT_DIR"
  INPUT_DIR="$ROOT_DIR/$INPUT_DIR"
fi

if [[ -z "${STRAPI_API_TOKEN:-}" && -f "$SECRET_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$SECRET_FILE"
  set +a
fi

if [[ -z "${STRAPI_API_TOKEN:-}" ]]; then
  echo "ERROR: STRAPI_API_TOKEN is required for ui-locale import."
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
  -e INPUT_DIR="$CONTAINER_INPUT_DIR" \
  -e UI_LOCALE_STATUS="${UI_LOCALE_STATUS:-draft}" \
  -e UI_REFERENCE_LOCALE="$UI_REFERENCE_LOCALE" \
  node:20-alpine \
  node tools/import_ui_locales.js
