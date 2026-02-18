#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_PATH="${UI_LOCALE_PROGRESS_REPORT:-$ROOT_DIR/artifacts/ui-locale-progress.json}"
STRICT_MODE="${UI_LOCALE_PROGRESS_STRICT:-false}"

if [[ "$REPORT_PATH" = /* ]]; then
  if [[ "$REPORT_PATH" == "$ROOT_DIR/"* ]]; then
    CONTAINER_REPORT_PATH="/work/${REPORT_PATH#"$ROOT_DIR/"}"
  else
    echo "ERROR: UI_LOCALE_PROGRESS_REPORT absolute path must be under $ROOT_DIR"
    exit 1
  fi
else
  CONTAINER_REPORT_PATH="/work/$REPORT_PATH"
  REPORT_PATH="$ROOT_DIR/$REPORT_PATH"
fi

if [[ ! -f "$REPORT_PATH" ]]; then
  echo "ERROR: progress report not found: $REPORT_PATH"
  echo "Run: bash tools/export_ui_locales.sh"
  exit 1
fi

docker run --rm -i \
  -v "$ROOT_DIR:/work" \
  -w /work \
  -e REPORT_PATH="$CONTAINER_REPORT_PATH" \
  -e STRICT_MODE="$STRICT_MODE" \
  node:20-alpine \
  node - <<'NODE'
const fs = require('fs');
const path = require('path');

const reportPath = process.env.REPORT_PATH || '';
const strictMode = String(process.env.STRICT_MODE || 'false').toLowerCase() === 'true';

const resolved = path.isAbsolute(reportPath) ? reportPath : path.join(process.cwd(), reportPath);
const raw = fs.readFileSync(resolved, 'utf8');
const payload = JSON.parse(raw);
const locales = Array.isArray(payload.locales) ? payload.locales : [];

if (locales.length === 0) {
  console.log('WARN: ui-locale progress has no locale rows.');
  process.exit(0);
}

const header = ['locale', 'status', 'coverage%', 'missing', 'untranslated', 'deploy_required'];
const rows = locales.map((row) => [
  String(row.ui_locale || ''),
  String(row.status || ''),
  String(row.coverage_percent ?? ''),
  String(row.missing_keys ?? 0),
  String(row.untranslated_keys ?? 0),
  row.deploy_required ? 'yes' : 'no',
]);

const widths = header.map((title, colIndex) =>
  Math.max(
    title.length,
    ...rows.map((row) => String(row[colIndex] || '').length)
  )
);

const line = (values) =>
  values
    .map((value, index) => String(value).padEnd(widths[index], ' '))
    .join('  ');

console.log('==============================================================');
console.log('GEOVITO UI LOCALE PROGRESS');
console.log(`report=${resolved}`);
console.log(`generated_at=${payload.generated_at || 'unknown'}`);
console.log(`reference_locale=${payload.reference_locale || 'unknown'}`);
console.log('==============================================================');
console.log(line(header));
console.log(line(widths.map((size) => '-'.repeat(size))));
for (const row of rows) {
  console.log(line(row));
}

let totalMissing = 0;
let totalUntranslated = 0;
let pendingLocales = 0;
for (const row of locales) {
  totalMissing += Number(row.missing_keys || 0);
  totalUntranslated += Number(row.untranslated_keys || 0);
  if (row.deploy_required) pendingLocales += 1;
}

console.log('--------------------------------------------------------------');
console.log(`summary: locales=${locales.length} missing_total=${totalMissing} untranslated_total=${totalUntranslated} deploy_required_locales=${pendingLocales}`);

if (totalMissing > 0 || totalUntranslated > 0) {
  console.log(`WARN: translation gaps found (missing=${totalMissing}, untranslated=${totalUntranslated})`);
  if (strictMode) {
    console.log('FAIL: strict mode enabled (UI_LOCALE_PROGRESS_STRICT=true)');
    process.exit(1);
  }
} else {
  console.log('PASS: all locale keys translated.');
}
NODE
