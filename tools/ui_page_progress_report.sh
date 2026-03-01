#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STRAPI_BASE_URL="${STRAPI_BASE_URL:-http://127.0.0.1:1337}"
UI_LOCALE_SECRET_FILE="${UI_LOCALE_SECRET_FILE:-$HOME/.config/geovito/ui_locale.env}"
UI_PAGE_PROGRESS_STRICT="${UI_PAGE_PROGRESS_STRICT:-false}"
UI_PAGE_PROGRESS_PATH="${UI_PAGE_PROGRESS_PATH:-/api/ui-pages/meta/progress}"

usage() {
  cat <<'USAGE'
Usage:
  bash tools/ui_page_progress_report.sh [--strict]

Env:
  STRAPI_BASE_URL          Strapi base URL (default: http://127.0.0.1:1337)
  UI_LOCALE_SECRET_FILE    Optional secret file with STRAPI_API_TOKEN (default: ~/.config/geovito/ui_locale.env)
  UI_PAGE_PROGRESS_STRICT  true => fail if any page has missing/draft locales
  UI_PAGE_PROGRESS_PATH    Progress endpoint path (default: /api/ui-pages/meta/progress)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict)
      UI_PAGE_PROGRESS_STRICT="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${STRAPI_API_TOKEN:-}" && -f "$UI_LOCALE_SECRET_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$UI_LOCALE_SECRET_FILE"
  set +a
fi

if [[ -n "${STRAPI_API_TOKEN:-}" && "${STRAPI_API_TOKEN}" == *"REPLACE_WITH_REAL_STRAPI_API_TOKEN"* ]]; then
  echo "ERROR: placeholder token found in $UI_LOCALE_SECRET_FILE"
  echo "Edit file and set real token: nano \"$UI_LOCALE_SECRET_FILE\""
  exit 1
fi

TMP_BODY="$(mktemp)"
trap 'rm -f "$TMP_BODY"' EXIT

curl_args=(-sS -o "$TMP_BODY" -w '%{http_code}' -H 'Accept: application/json')
if [[ -n "${STRAPI_API_TOKEN:-}" ]]; then
  curl_args+=(-H "Authorization: Bearer $STRAPI_API_TOKEN")
fi

STATUS_CODE="$(curl "${curl_args[@]}" "${STRAPI_BASE_URL%/}${UI_PAGE_PROGRESS_PATH}")"

if [[ "$STATUS_CODE" != "200" ]]; then
  echo "ERROR: ui-page progress request failed (status=$STATUS_CODE)"
  cat "$TMP_BODY"
  exit 1
fi

docker run --rm -i \
  -v "$ROOT_DIR:/work" \
  -w /work \
  -e UI_PAGE_PROGRESS_STRICT="$UI_PAGE_PROGRESS_STRICT" \
  node:20-alpine \
  node tools/ui_page_progress_report.js <"$TMP_BODY"
