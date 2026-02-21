#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const { computeTranslationStats } = require('../app/src/modules/ui-locale/metrics');

const STRAPI_BASE_URL = (process.env.STRAPI_BASE_URL || 'http://127.0.0.1:1337').replace(/\/$/, '');
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '';
const INPUT_DIR = process.env.INPUT_DIR || path.join(process.cwd(), 'artifacts', 'ui-locales');
const DEFAULT_STATUS = process.env.UI_LOCALE_STATUS || 'draft';
const UI_REFERENCE_LOCALE = String(process.env.UI_REFERENCE_LOCALE || 'en')
  .trim()
  .toLowerCase();

const asRecord = (entry) => {
  if (!entry) return null;
  if (entry.attributes) {
    return {
      id: entry.id,
      documentId: entry.documentId || entry.attributes?.documentId || null,
      ...entry.attributes,
    };
  }
  return entry;
};

const resolveLocaleIdentifier = (record) => {
  if (!record || typeof record !== 'object') return null;
  if (record.documentId) return String(record.documentId);
  if (record.id != null) return String(record.id);
  return null;
};

const normalizeReferenceStats = (stats, isReferenceLocale) => {
  if (!isReferenceLocale) return stats;
  const total = Number(stats?.total_keys || 0);
  return {
    ...stats,
    translated_keys: total,
    missing_keys: 0,
    untranslated_keys: 0,
    coverage_percent: 100,
    missing_examples: [],
    untranslated_examples: [],
  };
};

const buildStatsPayload = (referenceStrings, localeStrings, localeCode, referenceLocale) => {
  const statsRaw = computeTranslationStats(referenceStrings || {}, localeStrings || {});
  const stats = normalizeReferenceStats(statsRaw, localeCode === referenceLocale);
  return {
    total_keys: stats.total_keys,
    translated_keys: stats.translated_keys,
    missing_keys: stats.missing_keys,
    untranslated_keys: stats.untranslated_keys,
    coverage_percent: stats.coverage_percent,
    missing_examples: stats.missing_examples,
    untranslated_examples: stats.untranslated_examples,
  };
};

const fetchJson = async (url, options = {}) => {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Request failed: ${response.status} ${url} ${text}`);
  }
  return response.json();
};

const findLocale = async (locale) => {
  const url = new URL(`${STRAPI_BASE_URL}/api/ui-locales`);
  url.searchParams.set('filters[ui_locale][$eq]', locale);
  url.searchParams.set('pagination[pageSize]', '1');
  const payload = await fetchJson(url.toString(), {
    headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
  });
  return asRecord(Array.isArray(payload?.data) ? payload.data[0] : null);
};

const listLocales = async () => {
  const url = new URL(`${STRAPI_BASE_URL}/api/ui-locales`);
  url.searchParams.set('pagination[pageSize]', '500');
  const payload = await fetchJson(url.toString(), {
    headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
  });
  return Array.isArray(payload?.data) ? payload.data.map(asRecord).filter(Boolean) : [];
};

const upsertLocale = async (locale, strings, referenceStrings, referenceLocale) => {
  const existing = await findLocale(locale);
  const nowIso = new Date().toISOString();
  const statsPayload = buildStatsPayload(referenceStrings, strings, locale, referenceLocale);
  const payload = {
    data: {
      ui_locale: locale,
      reference_locale: referenceLocale,
      status: DEFAULT_STATUS,
      strings,
      deploy_required: true,
      last_imported_at: nowIso,
      ...statsPayload,
    },
  };

  const recordIdentifier = resolveLocaleIdentifier(existing);

  if (recordIdentifier) {
    await fetchJson(`${STRAPI_BASE_URL}/api/ui-locales/${recordIdentifier}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${STRAPI_API_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    console.log(`Updated ui-locale ${locale}`);
    return;
  }

  await fetchJson(`${STRAPI_BASE_URL}/api/ui-locales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${STRAPI_API_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
    console.log(`Created ui-locale ${locale}`);
};

const refreshMetricsForAllLocales = async (referenceLocale) => {
  const records = await listLocales();
  if (records.length === 0) return;

  const referenceRecord = records.find((entry) => String(entry.ui_locale || '').toLowerCase() === referenceLocale);
  const referenceStrings = referenceRecord?.strings || {};

  for (const record of records) {
    const locale = String(record.ui_locale || '').trim().toLowerCase();
    const recordIdentifier = resolveLocaleIdentifier(record);
    if (!locale || !recordIdentifier) continue;

    const statsPayload = buildStatsPayload(referenceStrings, record.strings || {}, locale, referenceLocale);
    await fetchJson(`${STRAPI_BASE_URL}/api/ui-locales/${recordIdentifier}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${STRAPI_API_TOKEN}`,
      },
      body: JSON.stringify({
        data: statsPayload,
      }),
    });
  }
};

const main = async () => {
  if (!STRAPI_API_TOKEN) {
    console.error('ERROR: STRAPI_API_TOKEN is required for ui-locale import.');
    process.exit(1);
  }

  const entries = await fs.readdir(INPUT_DIR).catch(() => []);
  const localeFiles = entries
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => ({ file: entry, locale: entry.replace(/\.json$/i, '').trim().toLowerCase() }))
    .filter((entry) => entry.locale.length > 0);

  if (localeFiles.length === 0) {
    console.error(`ERROR: no files found in ${INPUT_DIR}`);
    process.exit(1);
  }

  const filePayloadByLocale = new Map();

  for (const item of localeFiles) {
    try {
      const filePath = path.join(INPUT_DIR, item.file);
      const raw = await fs.readFile(filePath, 'utf8');
      const strings = JSON.parse(raw);
      filePayloadByLocale.set(item.locale, strings);
    } catch (error) {
      console.error(`WARN: skip ${item.locale} (${error.message})`);
    }
  }

  const fallbackReference = await findLocale(UI_REFERENCE_LOCALE);
  const referenceStrings = filePayloadByLocale.get(UI_REFERENCE_LOCALE) || fallbackReference?.strings || {};

  let processed = 0;
  for (const [locale, strings] of filePayloadByLocale.entries()) {
    await upsertLocale(locale, strings, referenceStrings, UI_REFERENCE_LOCALE);
    processed += 1;
  }

  await refreshMetricsForAllLocales(UI_REFERENCE_LOCALE);

  console.log(`UI locale import complete. Processed ${processed} locale file(s).`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
