import fs from 'node:fs';
import path from 'node:path';

const frontendDir = process.env.FRONTEND_DIR_IN_CONTAINER || '/repo/frontend';
const artifactDir = process.env.ARTIFACT_DIR_IN_CONTAINER || '/repo/artifacts/i18n';
const failOnMissingEn = process.env.I18N_FALLBACK_AUDIT_FAIL_ON_MISSING_EN === '1';
const failOnVisibleLeak = process.env.I18N_FALLBACK_AUDIT_FAIL_ON_VISIBLE_LEAK === '1';
const failOnParityGap = process.env.I18N_FALLBACK_AUDIT_FAIL_ON_PARITY_GAP === '1';

const scopePrefixes = [
  'src/pages/[lang]/dashboard/',
  'src/pages/[lang]/atlas/',
  'src/pages/[lang]/account/',
  'src/pages/[lang]/auth/',
  'src/pages/[lang]/login',
  'src/pages/[lang]/register',
  'src/pages/[lang]/forgot-password',
  'src/pages/[lang]/reset-password',
  'src/pages/[lang]/search/',
  'src/pages/[lang]/@[username]/',
  'src/pages/u/[username]/',
  'src/components/',
  'src/layouts/',
];

const includeFile = (relativePath) => {
  if (!/\.(astro|ts|tsx|js|mjs)$/.test(relativePath)) return false;
  return scopePrefixes.some((prefix) => relativePath.startsWith(prefix));
};

const walkFiles = (dir, results = []) => {
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (['node_modules', 'dist', '.astro', 'test-results'].includes(entry)) continue;
      walkFiles(fullPath, results);
      continue;
    }
    const relativePath = fullPath.replace(`${frontendDir}/`, '');
    if (includeFile(relativePath)) results.push(relativePath);
  }
  return results;
};

const flatten = (obj, prefix = '') =>
  Object.entries(obj || {}).reduce((acc, [key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(acc, flatten(value, full));
    } else {
      acc[full] = String(value);
    }
    return acc;
  }, {});

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(frontendDir, relativePath), 'utf8'));

const enFlat = flatten(readJson('src/i18n/en.json'));
const trFlat = flatten(readJson('src/i18n/tr.json'));
const frFlat = flatten(readJson('src/i18n/fr.json'));

const enKeys = new Set(Object.keys(enFlat));
const trKeys = new Set(Object.keys(trFlat));
const frKeys = new Set(Object.keys(frFlat));

const files = walkFiles(path.join(frontendDir, 'src')).sort((a, b) => a.localeCompare(b));

const keyReferencePatterns = [
  /translate\(\s*ui\s*,\s*["\x27]([^"\x27]+)["\x27]/g,
  /\bt\(\s*["\x27]([^"\x27]+)["\x27]/g,
];
const fallbackPatterns = [
  /translate\(\s*ui\s*,\s*'([^']+)'\s*,\s*\{[\s\S]*?\}\s*,\s*'((?:\\.|[^'\\])*)'\s*\)/g,
  /translate\(\s*ui\s*,\s*"([^"]+)"\s*,\s*\{[\s\S]*?\}\s*,\s*"((?:\\.|[^"\\])*)"\s*\)/g,
  /\bt\(\s*'([^']+)'\s*,\s*'((?:\\.|[^'\\])*)'\s*\)/g,
  /\bt\(\s*"([^"]+)"\s*,\s*"((?:\\.|[^"\\])*)"\s*\)/g,
];

const decodeFallback = (value) =>
  String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');

const keyMap = new Map();
for (const file of files) {
  const source = fs.readFileSync(path.join(frontendDir, file), 'utf8');
  for (const pattern of keyReferencePatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) {
      const key = match[1];
      if (!keyMap.has(key)) keyMap.set(key, new Set());
      keyMap.get(key).add(file);
    }
  }
}

const listFromMap = (map) =>
  Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, set]) => ({ key, files: Array.from(set).sort((x, y) => x.localeCompare(y)) }));

const missingEnMap = new Map();
const missingTrMap = new Map();
const missingFrMap = new Map();
const untranslatedTrMap = new Map();
const untranslatedFrMap = new Map();

for (const [key, fileSet] of keyMap.entries()) {
  if (!enKeys.has(key)) missingEnMap.set(key, fileSet);
  if (!trKeys.has(key)) missingTrMap.set(key, fileSet);
  if (!frKeys.has(key)) missingFrMap.set(key, fileSet);

  if (enKeys.has(key) && trKeys.has(key) && enFlat[key] === trFlat[key]) {
    untranslatedTrMap.set(key, fileSet);
  }
  if (enKeys.has(key) && frKeys.has(key) && enFlat[key] === frFlat[key]) {
    untranslatedFrMap.set(key, fileSet);
  }
}

const fallbackMismatches = [];
for (const file of files) {
  const source = fs.readFileSync(path.join(frontendDir, file), 'utf8');
  for (const pattern of fallbackPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) {
      const key = match[1];
      const fallback = decodeFallback(match[2]);
      const enValue = enFlat[key];
      if (typeof enValue !== 'string') continue;
      if (enValue !== fallback) {
        fallbackMismatches.push({
          type: 'fallback_leak',
          reason: 'inline_fallback_mismatch',
          key,
          file,
          en: enValue,
          fallback,
        });
      }
    }
  }
}

const missingEn = listFromMap(missingEnMap).map((item) => ({ type: 'missing_key', reason: 'missing_en', ...item }));
const missingTr = listFromMap(missingTrMap).map((item) => ({ type: 'fallback_leak', reason: 'missing_tr', ...item }));
const missingFr = listFromMap(missingFrMap).map((item) => ({ type: 'fallback_leak', reason: 'missing_fr', ...item }));
const parityGapTr = listFromMap(untranslatedTrMap).map((item) => ({ type: 'parity_gap', reason: 'tr_equals_en', ...item }));
const parityGapFr = listFromMap(untranslatedFrMap).map((item) => ({ type: 'parity_gap', reason: 'fr_equals_en', ...item }));

const report = {
  generated_at: new Date().toISOString(),
  scope: 'site_usage_language_fallback_visibility',
  strict: {
    fail_on_missing_en: failOnMissingEn,
    fail_on_visible_leak: failOnVisibleLeak,
    fail_on_parity_gap: failOnParityGap,
  },
  totals: {
    files_scanned: files.length,
    referenced_key_count: keyMap.size,
    missing_en_count: missingEn.length,
    fallback_leak_count: missingTr.length + missingFr.length + fallbackMismatches.length,
    fallback_mismatch_count: fallbackMismatches.length,
    parity_gap_count: parityGapTr.length + parityGapFr.length,
  },
  missing_en: missingEn,
  fallback_leaks: {
    missing_tr: missingTr,
    missing_fr: missingFr,
    inline_fallback_mismatch: fallbackMismatches,
  },
  parity_gaps: {
    tr_equals_en: parityGapTr,
    fr_equals_en: parityGapFr,
  },
};

fs.mkdirSync(artifactDir, { recursive: true });
const jsonPath = path.join(artifactDir, 'fallback-leaks-last.json');
const txtPath = path.join(artifactDir, 'fallback-leaks-last.txt');

const lines = [
  'GEOVITO I18N FALLBACK LEAKS AUDIT',
  `generated_at=${report.generated_at}`,
  `files_scanned=${report.totals.files_scanned}`,
  `referenced_key_count=${report.totals.referenced_key_count}`,
  `missing_en_count=${report.totals.missing_en_count}`,
  `fallback_leak_count=${report.totals.fallback_leak_count}`,
  `fallback_mismatch_count=${report.totals.fallback_mismatch_count}`,
  `parity_gap_count=${report.totals.parity_gap_count}`,
  `missing_tr_count=${missingTr.length}`,
  `missing_fr_count=${missingFr.length}`,
  `tr_equals_en_count=${parityGapTr.length}`,
  `fr_equals_en_count=${parityGapFr.length}`,
];

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(txtPath, `${lines.join('\n')}\n`, 'utf8');

console.log(`PASS: report written -> ${jsonPath}`);
console.log(`PASS: summary written -> ${txtPath}`);
console.log(
  `PASS: missing_en=${report.totals.missing_en_count}; visible_leaks=${report.totals.fallback_leak_count}; parity_gaps=${report.totals.parity_gap_count}`
);

if (failOnMissingEn && report.totals.missing_en_count > 0) {
  console.error(`FAIL: missing en keys detected (${report.totals.missing_en_count})`);
  process.exit(30);
}

if (failOnVisibleLeak && report.totals.fallback_leak_count > 0) {
  console.error(`FAIL: visible fallback leaks detected (${report.totals.fallback_leak_count})`);
  process.exit(31);
}

if (failOnParityGap && report.totals.parity_gap_count > 0) {
  console.error(`FAIL: parity gaps detected (${report.totals.parity_gap_count})`);
  process.exit(32);
}

console.log('I18N FALLBACK LEAKS AUDIT: PASS');
