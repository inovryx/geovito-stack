import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const I18N_DIR = join(ROOT, 'src', 'i18n');
const OUTPUT_DIR = join(ROOT, 'i18n-export');

const localeFiles = ['en.json', 'tr.json', 'de.json', 'es.json', 'ru.json', 'zh-cn.json'];

const loadJson = (file) => JSON.parse(readFileSync(join(I18N_DIR, file), 'utf8'));

const flatten = (object, prefix = '') => {
  const result = {};

  for (const [key, value] of Object.entries(object)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }

  return result;
};

const base = loadJson('en.json');
const baseFlat = flatten(base);
const baseKeys = Object.keys(baseFlat).sort();

const mode = process.argv[2] || 'check';

if (mode === 'check') {
  let hasError = false;

  for (const file of localeFiles) {
    const locale = file.replace('.json', '');
    const flat = flatten(loadJson(file));
    const keys = Object.keys(flat);

    const missing = baseKeys.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !baseKeys.includes(key));

    if (missing.length || extra.length) {
      hasError = true;
      console.error(`Locale ${locale} failed key parity check.`);
      if (missing.length) {
        console.error(`  Missing (${missing.length}): ${missing.join(', ')}`);
      }
      if (extra.length) {
        console.error(`  Extra (${extra.length}): ${extra.join(', ')}`);
      }
    }
  }

  if (hasError) {
    process.exit(1);
  }

  console.log('i18n check passed: all locale files match en.json keys.');
  process.exit(0);
}

if (mode === 'export') {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, 'en.flat.json'), `${JSON.stringify(baseFlat, null, 2)}\n`, 'utf8');

  const keyList = baseKeys.map((key) => ({ key, value: baseFlat[key] }));
  writeFileSync(join(OUTPUT_DIR, 'en.keys.json'), `${JSON.stringify(keyList, null, 2)}\n`, 'utf8');

  console.log('i18n export completed: i18n-export/en.flat.json, i18n-export/en.keys.json');
  process.exit(0);
}

console.error('Usage: node scripts/i18n_workflow.mjs <check|export>');
process.exit(1);
