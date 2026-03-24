import fs from 'node:fs';
import path from 'node:path';

const frontendDir = process.env.FRONTEND_DIR_IN_CONTAINER || '/repo/frontend';
const targetFilesCsv =
  process.env.TARGET_FILES_CSV ||
  'src/pages/[lang]/dashboard/index.astro,src/pages/[lang]/account/index.astro';
const targetFiles = targetFilesCsv
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

if (targetFiles.length === 0) {
  console.error('FAIL: no target files provided');
  process.exit(1);
}

const i18nDir = path.join(frontendDir, 'src', 'i18n');
if (!fs.existsSync(i18nDir)) {
  console.error(`FAIL: i18n directory missing -> ${i18nDir}`);
  process.exit(1);
}

const localeFiles = fs
  .readdirSync(i18nDir)
  .filter((file) => file.endsWith('.json'))
  .sort((a, b) => a.localeCompare(b));

if (!localeFiles.includes('en.json')) {
  console.error('FAIL: en.json is required');
  process.exit(1);
}

const loadJson = (fileName) => JSON.parse(fs.readFileSync(path.join(i18nDir, fileName), 'utf8'));
const writeJson = (fileName, data) => {
  fs.writeFileSync(path.join(i18nDir, fileName), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const decodeFallback = (value) =>
  String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');

const extractionPatterns = [
  /translate\(\s*ui\s*,\s*'([^']+)'\s*,\s*\{[\s\S]*?\}\s*,\s*'((?:\\.|[^'\\])*)'\s*\)/g,
  /translate\(\s*ui\s*,\s*"([^"]+)"\s*,\s*\{[\s\S]*?\}\s*,\s*"((?:\\.|[^"\\])*)"\s*\)/g,
  /\bt\(\s*'([^']+)'\s*,\s*'((?:\\.|[^'\\])*)'\s*\)/g,
  /\bt\(\s*"([^"]+)"\s*,\s*"((?:\\.|[^"\\])*)"\s*\)/g,
];

const extracted = new Map();
const conflicts = [];
let matchedEntries = 0;

for (const relativeTarget of targetFiles) {
  const filePath = path.join(frontendDir, relativeTarget);
  if (!fs.existsSync(filePath)) {
    console.error(`FAIL: target file missing -> ${relativeTarget}`);
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, 'utf8');
  for (const pattern of extractionPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) {
      const key = String(match[1] || '').trim();
      const fallback = decodeFallback(match[2]);
      if (!key || !fallback) continue;
      matchedEntries += 1;

      if (!extracted.has(key)) {
        extracted.set(key, { fallback, file: relativeTarget });
        continue;
      }

      const previous = extracted.get(key);
      if (previous.fallback !== fallback) {
        conflicts.push({
          key,
          fallbackA: previous.fallback,
          fileA: previous.file,
          fallbackB: fallback,
          fileB: relativeTarget,
        });
      }
    }
  }
}

if (conflicts.length > 0) {
  console.error(`FAIL: fallback conflicts detected (${conflicts.length})`);
  for (const conflict of conflicts.slice(0, 50)) {
    console.error(` - ${conflict.key}`);
    console.error(`   A (${conflict.fileA}): ${conflict.fallbackA}`);
    console.error(`   B (${conflict.fileB}): ${conflict.fallbackB}`);
  }
  process.exit(2);
}

const setByPathIfMissing = (obj, keyPath, value) => {
  const parts = keyPath.split('.');
  let cursor = obj;

  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const next = cursor[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }

  const leaf = parts[parts.length - 1];
  if (cursor[leaf] === undefined) {
    cursor[leaf] = value;
    return true;
  }
  return false;
};

const getByPath = (obj, keyPath) =>
  keyPath.split('.').reduce((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return current[part];
  }, obj);

const localeData = new Map(localeFiles.map((fileName) => [fileName, loadJson(fileName)]));
const enData = localeData.get('en.json');
let enAdded = 0;

for (const [key, entry] of extracted.entries()) {
  if (setByPathIfMissing(enData, key, entry.fallback)) {
    enAdded += 1;
  }
}
localeData.set('en.json', enData);

const addedByLocale = new Map();
for (const fileName of localeFiles) {
  if (fileName === 'en.json') {
    addedByLocale.set(fileName, enAdded);
    continue;
  }

  const dictionary = localeData.get(fileName);
  let added = 0;
  for (const [key, entry] of extracted.entries()) {
    const canonical = getByPath(enData, key);
    const seedValue = canonical === undefined ? entry.fallback : String(canonical);
    if (setByPathIfMissing(dictionary, key, seedValue)) {
      added += 1;
    }
  }
  localeData.set(fileName, dictionary);
  addedByLocale.set(fileName, added);
}

for (const fileName of localeFiles) {
  writeJson(fileName, localeData.get(fileName));
}

console.log(`PASS: extracted entries=${matchedEntries}`);
console.log(`PASS: unique keys=${extracted.size}`);
for (const fileName of localeFiles) {
  const added = addedByLocale.get(fileName) || 0;
  console.log(`PASS: locale updated -> ${fileName} (+${added})`);
}
console.log('PASS: i18n seed from fallbacks completed');
