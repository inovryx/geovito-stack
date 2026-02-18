#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRET_FILE="${UI_LOCALE_SECRET_FILE:-$HOME/.config/geovito/ui_locale.env}"
RUN_BUILD_CHECK="true"
RUN_UI_PAGE_PROGRESS_REPORT="true"

usage() {
  cat <<'USAGE'
Usage:
  bash tools/ui_locale_publish.sh [--no-build-check] [--no-ui-page-report]

Behavior:
  1) Loads STRAPI_API_TOKEN from a local secret file (outside repo)
  2) Exports ui-locale records from Strapi to frontend/src/i18n/*.json
  3) Prints ui-locale progress summary
  4) Prints ui-page progress summary (unless --no-ui-page-report)
  5) Runs Cloudflare-compatible build check (unless --no-build-check)

Env:
  UI_LOCALE_SECRET_FILE   Secret file path (default: ~/.config/geovito/ui_locale.env)
  STRAPI_BASE_URL         Strapi base URL (default from export script)
  UI_REFERENCE_LOCALE     Reference locale for progress metrics (default: en)
  UI_LOCALE_PROGRESS_REPORT Progress report output (default: artifacts/ui-locale-progress.json)
  UI_LOCALE_PROGRESS_STRICT true => fail if missing/untranslated > 0 (default: false)
  UI_PAGE_PROGRESS_STRICT true => fail if ui-page draft/missing exists (default: false)

Secret file format example:
  STRAPI_API_TOKEN='your_real_token_here'
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build-check)
      RUN_BUILD_CHECK="false"
      shift
      ;;
    --no-ui-page-report)
      RUN_UI_PAGE_PROGRESS_REPORT="false"
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

if [[ ! -f "$SECRET_FILE" ]]; then
  echo "INFO: ui-locale secret file missing, creating template..."
  bash tools/ui_locale_secret_init.sh
  echo "ERROR: set real STRAPI_API_TOKEN in $SECRET_FILE and rerun."
  exit 1
fi

# Load local secrets without committing them to repo.
set -a
# shellcheck disable=SC1090
source "$SECRET_FILE"
set +a

if [[ -z "${STRAPI_API_TOKEN:-}" ]]; then
  echo "ERROR: STRAPI_API_TOKEN missing in $SECRET_FILE"
  exit 1
fi

if [[ "${STRAPI_API_TOKEN}" == *"REPLACE_WITH_REAL_STRAPI_API_TOKEN"* ]]; then
  echo "ERROR: placeholder token found in $SECRET_FILE"
  echo "Edit file and set real token: nano \"$SECRET_FILE\""
  exit 1
fi

cd "$ROOT_DIR"

echo "=============================================================="
echo "GEOVITO UI LOCALE PUBLISH"
echo "secret_file=$SECRET_FILE"
echo "=============================================================="

bash tools/export_ui_locales.sh
bash tools/ui_locale_progress_report.sh
if [[ "$RUN_UI_PAGE_PROGRESS_REPORT" == "true" ]]; then
  bash tools/ui_page_progress_report.sh
else
  echo "Skip ui-page progress report (--no-ui-page-report)"
fi

if [[ "$RUN_BUILD_CHECK" == "true" ]]; then
  bash tools/pages_build_check.sh
else
  echo "Skip build check (--no-build-check)"
fi

echo "=============================================================="
echo "UI LOCALE PUBLISH: PASS"
echo "Next: commit + push to trigger Cloudflare Pages deploy."
echo "=============================================================="
