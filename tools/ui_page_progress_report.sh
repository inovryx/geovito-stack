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
  UI_LOCALE_SECRET_FILE    Secret file with STRAPI_API_TOKEN (default: ~/.config/geovito/ui_locale.env)
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

if [[ -z "${STRAPI_API_TOKEN:-}" ]]; then
  echo "ERROR: STRAPI_API_TOKEN is required."
  echo "Hint: bash tools/ui_locale_secret_init.sh"
  exit 1
fi

if [[ "${STRAPI_API_TOKEN}" == *"REPLACE_WITH_REAL_STRAPI_API_TOKEN"* ]]; then
  echo "ERROR: placeholder token found in $UI_LOCALE_SECRET_FILE"
  echo "Edit file and set real token: nano \"$UI_LOCALE_SECRET_FILE\""
  exit 1
fi

TMP_BODY="$(mktemp)"
trap 'rm -f "$TMP_BODY"' EXIT

STATUS_CODE="$(curl -sS -o "$TMP_BODY" -w '%{http_code}' \
  -H "Authorization: Bearer $STRAPI_API_TOKEN" \
  -H 'Accept: application/json' \
  "${STRAPI_BASE_URL%/}${UI_PAGE_PROGRESS_PATH}")"

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
  node - <"$TMP_BODY" <<'NODE'
const fs = require('fs');

const strictMode = String(process.env.UI_PAGE_PROGRESS_STRICT || 'false').toLowerCase() === 'true';
const input = fs.readFileSync(0, 'utf8');

let payload;
try {
  payload = JSON.parse(input);
} catch (error) {
  console.error(`ERROR: invalid JSON response (${error.message})`);
  process.exit(1);
}

const data = payload && payload.data ? payload.data : {};
const totals = data.totals || {};
const pages = Array.isArray(data.pages) ? data.pages : [];
const localeCoverage = Array.isArray(data.locale_coverage) ? data.locale_coverage : [];

const printTable = (title, header, rows) => {
  if (!rows.length) {
    console.log(`${title}: none`);
    return;
  }
  const widths = header.map((name, index) =>
    Math.max(name.length, ...rows.map((row) => String(row[index] ?? '').length))
  );
  const line = (values) => values.map((value, i) => String(value ?? '').padEnd(widths[i], ' ')).join('  ');
  console.log(title);
  console.log(line(header));
  console.log(line(widths.map((size) => '-'.repeat(size))));
  for (const row of rows) {
    console.log(line(row));
  }
};

console.log('==============================================================');
console.log('GEOVITO UI PAGE PROGRESS');
console.log('==============================================================');
console.log(`pages=${Number(totals.pages || 0)}`);
console.log(`fully_complete_pages=${Number(totals.fully_complete_pages || 0)}`);
console.log(`pages_with_missing=${Number(totals.pages_with_missing || 0)}`);
console.log(`pages_with_draft=${Number(totals.pages_with_draft || 0)}`);
console.log('--------------------------------------------------------------');

printTable(
  'Locale Coverage',
  ['lang', 'complete', 'draft', 'missing', 'coverage%'],
  localeCoverage.map((row) => [
    row.language || '',
    Number(row.complete_pages || 0),
    Number(row.draft_pages || 0),
    Number(row.missing_pages || 0),
    Number(row.coverage_percent || 0),
  ])
);

console.log('--------------------------------------------------------------');
printTable(
  'Pages',
  ['page_key', 'complete', 'draft', 'missing', 'canonical'],
  pages.map((row) => [
    row.page_key || '',
    Number(row.complete_count || 0),
    Number(row.draft_count || 0),
    Number(row.missing_count || 0),
    row.canonical_language || '',
  ])
);

const pagesWithIssues = pages.filter((row) => Number(row.missing_count || 0) > 0 || Number(row.draft_count || 0) > 0);
if (pagesWithIssues.length > 0) {
  console.log('--------------------------------------------------------------');
  console.log('WARN: pages with translation gaps:');
  for (const page of pagesWithIssues) {
    const missingList = Array.isArray(page.missing_locales) ? page.missing_locales.join(',') : '';
    const draftList = Array.isArray(page.draft_locales) ? page.draft_locales.join(',') : '';
    console.log(
      `- ${page.page_key}: missing=[${missingList || '-'}] draft=[${draftList || '-'}]`
    );
  }
}

if (strictMode && pagesWithIssues.length > 0) {
  console.log('FAIL: strict mode enabled (UI_PAGE_PROGRESS_STRICT=true)');
  process.exit(1);
}

console.log('==============================================================');
console.log('UI PAGE PROGRESS: PASS');
console.log('==============================================================');
NODE
