'use strict';

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
    console.log(`- ${page.page_key}: missing=[${missingList || '-'}] draft=[${draftList || '-'}]`);
  }
}

if (strictMode && pagesWithIssues.length > 0) {
  console.log('FAIL: strict mode enabled (UI_PAGE_PROGRESS_STRICT=true)');
  process.exit(1);
}

console.log('==============================================================');
console.log('UI PAGE PROGRESS: PASS');
console.log('==============================================================');
