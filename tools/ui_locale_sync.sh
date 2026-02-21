#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRET_FILE="${UI_LOCALE_SECRET_FILE:-$HOME/.config/geovito/ui_locale.env}"
RUN_BUILD_CHECK="true"

usage() {
  cat <<'USAGE'
Usage:
  bash tools/ui_locale_sync.sh [--no-build-check]

Flow:
  1) Import artifacts/ui-locales/*.json -> Strapi ui-locale
  2) Export Strapi ui-locale -> frontend/src/i18n/*.json
  3) Run Cloudflare-compatible build check (optional)

Env:
  UI_LOCALE_SECRET_FILE   Secret file path (default: ~/.config/geovito/ui_locale.env)
  INPUT_DIR               Import directory (default: artifacts/ui-locales)
  STRAPI_BASE_URL         Strapi base URL (default from import/export scripts)
  UI_REFERENCE_LOCALE     Reference locale for progress metrics (default: en)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build-check)
      RUN_BUILD_CHECK="false"
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

cd "$ROOT_DIR"

if [[ -z "${STRAPI_API_TOKEN:-}" && ! -f "$SECRET_FILE" ]]; then
  echo "INFO: ui-locale secret file missing, creating template..."
  bash tools/ui_locale_secret_init.sh
  echo "ERROR: set real STRAPI_API_TOKEN in $SECRET_FILE and rerun."
  exit 1
fi

echo "=============================================================="
echo "GEOVITO UI LOCALE SYNC"
echo "secret_file=${SECRET_FILE}"
echo "input_dir=${INPUT_DIR:-$ROOT_DIR/artifacts/ui-locales}"
echo "=============================================================="

bash tools/import_ui_locales.sh

if [[ "$RUN_BUILD_CHECK" == "true" ]]; then
  bash tools/ui_locale_publish.sh
else
  bash tools/ui_locale_publish.sh --no-build-check
fi

echo "=============================================================="
echo "UI LOCALE SYNC: PASS"
echo "Next: commit + push to trigger Cloudflare Pages deploy."
echo "=============================================================="
