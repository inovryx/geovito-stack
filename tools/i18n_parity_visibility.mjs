import fs from 'node:fs';
import path from 'node:path';

const frontendDir = process.env.FRONTEND_DIR_IN_CONTAINER || '/repo/frontend';
const artifactDir = process.env.ARTIFACT_DIR_IN_CONTAINER || '/repo/artifacts/i18n';
const strictParity = process.env.STRICT_PARITY === '1';

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(frontendDir, relativePath), 'utf8'));
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

const classifyKeyRoot = (key) => {
  if (key.startsWith('dashboard.')) return 'dashboard';
  if (key.startsWith('account.')) return 'account';
  if (key.startsWith('auth.')) return 'auth';
  if (
    key.startsWith('layout.') ||
    key.startsWith('nav.') ||
    key.startsWith('footer.') ||
    key.startsWith('site.') ||
    key.startsWith('errorPage.') ||
    key.startsWith('language.') ||
    key.startsWith('consent.')
  ) {
    return 'layout';
  }
  if (key.startsWith('tools.')) return 'tools';
  if (key.startsWith('search.')) return 'search';
  return 'other';
};

const enFlat = flatten(readJson('src/i18n/en.json'));
const localeData = {
  tr: flatten(readJson('src/i18n/tr.json')),
  fr: flatten(readJson('src/i18n/fr.json')),
};

const enKeys = Object.keys(enFlat).sort((a, b) => a.localeCompare(b));
const enKeySet = new Set(enKeys);

const perLocale = {};
const parityFailures = [];

for (const locale of Object.keys(localeData)) {
  const flat = localeData[locale];
  const localeKeys = Object.keys(flat).sort((a, b) => a.localeCompare(b));
  const localeKeySet = new Set(localeKeys);

  const missing = enKeys.filter((key) => !localeKeySet.has(key));
  const extra = localeKeys.filter((key) => !enKeySet.has(key));
  const untranslated = enKeys.filter((key) => localeKeySet.has(key) && String(flat[key]) === String(enFlat[key]));

  const missingSet = new Set(missing);
  const untranslatedSet = new Set(untranslated);

  const roots = new Map();
  const ensureRoot = (name) => {
    if (!roots.has(name)) {
      roots.set(name, {
        root: name,
        en_keys: 0,
        missing: 0,
        untranslated: 0,
      });
    }
    return roots.get(name);
  };

  for (const key of enKeys) {
    const root = classifyKeyRoot(key);
    ensureRoot(root).en_keys += 1;
    if (missingSet.has(key)) ensureRoot(root).missing += 1;
    if (untranslatedSet.has(key)) ensureRoot(root).untranslated += 1;
  }

  const coverage = ((enKeys.length - missing.length) / Math.max(1, enKeys.length)) * 100;
  const untranslatedRate = (untranslated.length / Math.max(1, enKeys.length)) * 100;

  perLocale[locale] = {
    missing_count: missing.length,
    extra_count: extra.length,
    untranslated_count: untranslated.length,
    coverage_percent: Number(coverage.toFixed(2)),
    untranslated_percent: Number(untranslatedRate.toFixed(2)),
    missing_keys: missing,
    extra_keys: extra,
    untranslated_keys: untranslated,
    roots: Array.from(roots.values()).sort((a, b) => a.root.localeCompare(b.root)),
  };

  if (strictParity && (missing.length > 0 || extra.length > 0)) {
    parityFailures.push({
      locale,
      missing: missing.length,
      extra: extra.length,
    });
  }
}

const report = {
  generated_at: new Date().toISOString(),
  scope: 'site_usage_language_parity',
  source_locale: 'en',
  compare_locales: ['tr', 'fr'],
  strict_parity: strictParity,
  totals: {
    en_key_count: enKeys.length,
    locales_checked: Object.keys(localeData).length,
  },
  locales: perLocale,
  strict_failures: parityFailures,
};

fs.mkdirSync(artifactDir, { recursive: true });
const jsonPath = path.join(artifactDir, 'site-language-parity-last.json');
const textPath = path.join(artifactDir, 'site-language-parity-last.txt');

const summaryLines = ['GEOVITO I18N PARITY VISIBILITY', `generated_at=${report.generated_at}`, `en_key_count=${report.totals.en_key_count}`];

for (const locale of report.compare_locales) {
  const item = report.locales[locale];
  summaryLines.push(
    `${locale}: missing=${item.missing_count}, extra=${item.extra_count}, untranslated=${item.untranslated_count}, coverage=${item.coverage_percent}%`
  );
}

summaryLines.push('root_breakdown:');
for (const locale of report.compare_locales) {
  summaryLines.push(` ${locale}:`);
  for (const rootEntry of report.locales[locale].roots) {
    summaryLines.push(
      `  - ${rootEntry.root}: en_keys=${rootEntry.en_keys}, missing=${rootEntry.missing}, untranslated=${rootEntry.untranslated}`
    );
  }
}

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(textPath, `${summaryLines.join('\n')}\n`, 'utf8');

console.log(`PASS: report written -> ${jsonPath}`);
console.log(`PASS: summary written -> ${textPath}`);
for (const locale of report.compare_locales) {
  const item = report.locales[locale];
  console.log(
    `PASS: ${locale} parity -> missing=${item.missing_count}, extra=${item.extra_count}, untranslated=${item.untranslated_count}, coverage=${item.coverage_percent}%`
  );
}

if (parityFailures.length > 0) {
  for (const failure of parityFailures) {
    console.error(`FAIL: strict parity mismatch locale=${failure.locale} missing=${failure.missing} extra=${failure.extra}`);
  }
  process.exit(14);
}

console.log('I18N PARITY VISIBILITY: PASS');
