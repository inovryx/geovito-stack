import fs from 'node:fs';
import path from 'node:path';

const frontendDir = process.env.FRONTEND_DIR_IN_CONTAINER || '/repo/frontend';
const artifactDir = process.env.ARTIFACT_DIR_IN_CONTAINER || '/repo/artifacts/i18n';
const strictMissing = process.env.STRICT_MISSING === '1';
const failOnMismatch = process.env.FAIL_ON_MISMATCH === '1';

const enFile = path.join(frontendDir, 'src/i18n/en.json');
if (!fs.existsSync(enFile)) {
  console.error(`FAIL: en.json missing -> ${enFile}`);
  process.exit(1);
}

const criticalPrefixes = [
  'src/pages/[lang]/dashboard/',
  'src/pages/[lang]/account/',
  'src/pages/[lang]/auth/',
  'src/pages/[lang]/login',
  'src/pages/[lang]/register',
  'src/pages/[lang]/forgot-password',
  'src/pages/[lang]/reset-password',
  'src/pages/[lang]/search/',
  'src/layouts/',
  'src/components/LeftSidebar.astro',
  'src/components/RightTools.astro',
  'src/components/Nav.astro',
  'src/components/SearchBar.astro',
];

const rootBuckets = [
  { name: 'dashboard', match: (file) => file.startsWith('src/pages/[lang]/dashboard/') },
  { name: 'account', match: (file) => file.startsWith('src/pages/[lang]/account/') },
  {
    name: 'auth',
    match: (file) =>
      file.startsWith('src/pages/[lang]/auth/') ||
      file.startsWith('src/pages/[lang]/login') ||
      file.startsWith('src/pages/[lang]/register') ||
      file.startsWith('src/pages/[lang]/forgot-password') ||
      file.startsWith('src/pages/[lang]/reset-password'),
  },
  { name: 'layout', match: (file) => file.startsWith('src/layouts/') || file === 'src/components/Nav.astro' },
  { name: 'sidebar', match: (file) => file === 'src/components/LeftSidebar.astro' },
  { name: 'righttools', match: (file) => file === 'src/components/RightTools.astro' },
  {
    name: 'search',
    match: (file) => file.startsWith('src/pages/[lang]/search/') || file === 'src/components/SearchBar.astro',
  },
];

const classifyRoot = (file) => {
  for (const bucket of rootBuckets) {
    if (bucket.match(file)) return bucket.name;
  }
  return 'other';
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

const enFlat = flatten(readJson(enFile));
const enKeys = new Set(Object.keys(enFlat));

const files = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) {
      if (['node_modules', 'dist', '.astro', 'test-results'].includes(name)) continue;
      walk(fp);
      continue;
    }
    if (!/\.(astro|ts|tsx|js|mjs)$/.test(name)) continue;
    const rel = fp.replace(`${frontendDir}/`, '');
    if (criticalPrefixes.some((prefix) => rel.startsWith(prefix) || rel === prefix)) {
      files.push(rel);
    }
  }
};

walk(path.join(frontendDir, 'src'));
files.sort((a, b) => a.localeCompare(b));

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

const referencedKeys = new Map();
const byFileReferenceCount = new Map();
let referenceCallCount = 0;

const rootStats = new Map();
const ensureRoot = (name) => {
  if (!rootStats.has(name)) {
    rootStats.set(name, {
      root: name,
      referenced_keys: new Set(),
      missing_en_keys: new Set(),
      fallback_calls: 0,
      fallback_mismatch_calls: 0,
    });
  }
  return rootStats.get(name);
};

for (const file of files) {
  const root = classifyRoot(file);
  const source = fs.readFileSync(path.join(frontendDir, file), 'utf8');
  for (const pattern of keyReferencePatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) {
      referenceCallCount += 1;
      const key = match[1];
      if (!referencedKeys.has(key)) referencedKeys.set(key, new Set());
      referencedKeys.get(key).add(file);
      byFileReferenceCount.set(file, (byFileReferenceCount.get(file) || 0) + 1);
      ensureRoot(root).referenced_keys.add(key);
    }
  }
}

const missingEn = [];
const missingByFile = new Map();
for (const [key, fileSet] of referencedKeys.entries()) {
  if (enKeys.has(key)) continue;
  const filesForKey = Array.from(fileSet).sort((a, b) => a.localeCompare(b));
  missingEn.push({ key, files: filesForKey });
  for (const file of filesForKey) {
    missingByFile.set(file, (missingByFile.get(file) || 0) + 1);
    ensureRoot(classifyRoot(file)).missing_en_keys.add(key);
  }
}
missingEn.sort((a, b) => a.key.localeCompare(b.key));

const fallbackMismatches = [];
const fallbackByFile = new Map();
let fallbackCallCount = 0;

for (const file of files) {
  const root = classifyRoot(file);
  const source = fs.readFileSync(path.join(frontendDir, file), 'utf8');
  for (const pattern of fallbackPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) {
      fallbackCallCount += 1;
      ensureRoot(root).fallback_calls += 1;
      const key = match[1];
      const fallback = decodeFallback(match[2]);
      const enValue = enFlat[key];
      if (typeof enValue !== 'string') {
        continue;
      }
      if (enValue !== fallback) {
        fallbackMismatches.push({ key, file, en: enValue, fallback });
        fallbackByFile.set(file, (fallbackByFile.get(file) || 0) + 1);
        ensureRoot(root).fallback_mismatch_calls += 1;
      }
    }
  }
}

const fallbackMismatchKeys = new Set(fallbackMismatches.map((item) => item.key));

const toSortedCounts = (map) =>
  Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));

const report = {
  generated_at: new Date().toISOString(),
  scope: 'site_usage_language',
  source_of_truth_locale: 'en',
  critical_surfaces: criticalPrefixes,
  strict: {
    missing_en_fail: strictMissing,
    fallback_mismatch_fail: failOnMismatch,
  },
  totals: {
    files_scanned: files.length,
    reference_call_count: referenceCallCount,
    referenced_key_count: referencedKeys.size,
    missing_en_keys: missingEn.length,
    fallback_call_count: fallbackCallCount,
    fallback_mismatch_calls: fallbackMismatches.length,
    fallback_mismatch_keys: fallbackMismatchKeys.size,
  },
  missing_en: missingEn,
  fallback_mismatch: fallbackMismatches,
  by_file: {
    references: toSortedCounts(byFileReferenceCount),
    missing_en: toSortedCounts(missingByFile),
    fallback_mismatch: toSortedCounts(fallbackByFile),
  },
  by_root: Array.from(rootStats.values())
    .map((entry) => ({
      root: entry.root,
      referenced_keys: entry.referenced_keys.size,
      missing_en_keys: entry.missing_en_keys.size,
      fallback_calls: entry.fallback_calls,
      fallback_mismatch_calls: entry.fallback_mismatch_calls,
    }))
    .sort((a, b) => a.root.localeCompare(b.root)),
};

fs.mkdirSync(artifactDir, { recursive: true });
const jsonPath = path.join(artifactDir, 'site-language-audit-last.json');
const textPath = path.join(artifactDir, 'site-language-audit-last.txt');

const topMissing = report.by_file.missing_en
  .slice(0, 12)
  .map((item) => ` - ${item.name}: ${item.count}`)
  .join('\n');
const topMismatch = report.by_file.fallback_mismatch
  .slice(0, 12)
  .map((item) => ` - ${item.name}: ${item.count}`)
  .join('\n');
const topRoots = report.by_root
  .map(
    (item) =>
      ` - ${item.root}: refs=${item.referenced_keys}, missing_en=${item.missing_en_keys}, fallback_calls=${item.fallback_calls}, mismatch=${item.fallback_mismatch_calls}`
  )
  .join('\n');

const summary = [
  'GEOVITO I18N SITE LANGUAGE AUDIT',
  `generated_at=${report.generated_at}`,
  `files_scanned=${report.totals.files_scanned}`,
  `reference_call_count=${report.totals.reference_call_count}`,
  `referenced_key_count=${report.totals.referenced_key_count}`,
  `missing_en_keys=${report.totals.missing_en_keys}`,
  `fallback_call_count=${report.totals.fallback_call_count}`,
  `fallback_mismatch_calls=${report.totals.fallback_mismatch_calls}`,
  `fallback_mismatch_keys=${report.totals.fallback_mismatch_keys}`,
  'top_missing_files:',
  topMissing || ' - none',
  'top_fallback_mismatch_files:',
  topMismatch || ' - none',
  'root_distribution:',
  topRoots || ' - none',
].join('\n');

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(textPath, `${summary}\n`, 'utf8');

console.log(`PASS: report written -> ${jsonPath}`);
console.log(`PASS: summary written -> ${textPath}`);
console.log(`PASS: referenced keys=${report.totals.referenced_key_count}`);
console.log(`PASS: missing en keys=${report.totals.missing_en_keys}`);
console.log(`PASS: fallback mismatch calls=${report.totals.fallback_mismatch_calls}`);

if (strictMissing && report.totals.missing_en_keys > 0) {
  console.error(`FAIL: strict EN source check failed (missing keys=${report.totals.missing_en_keys})`);
  process.exit(12);
}

if (failOnMismatch && report.totals.fallback_mismatch_calls > 0) {
  console.error(`FAIL: fallback mismatch check failed (calls=${report.totals.fallback_mismatch_calls})`);
  process.exit(13);
}

console.log('I18N SITE LANGUAGE AUDIT: PASS');
