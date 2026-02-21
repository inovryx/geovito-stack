#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const { computeTranslationStats } = require('../app/src/modules/ui-locale/metrics');

const STRAPI_BASE_URL = (process.env.STRAPI_BASE_URL || 'http://127.0.0.1:1337').replace(/\/$/, '');
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '';
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), 'frontend', 'src', 'i18n');
const UPDATE_STATUS = (process.env.UPDATE_DEPLOY_STATUS || 'true').toLowerCase() !== 'false';
const UI_REFERENCE_LOCALE = String(process.env.UI_REFERENCE_LOCALE || 'en')
  .trim()
  .toLowerCase();
const PROGRESS_REPORT_PATH = process.env.UI_LOCALE_PROGRESS_REPORT || path.join(process.cwd(), 'artifacts', 'ui-locale-progress.json');

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

const getAllLocales = async () => {
  const url = new URL(`${STRAPI_BASE_URL}/api/ui-locales`);
  url.searchParams.set('pagination[pageSize]', '200');
  const headers = {};
  if (STRAPI_API_TOKEN) headers.Authorization = `Bearer ${STRAPI_API_TOKEN}`;
  const payload = await fetchJson(url.toString(), { headers });
  return Array.isArray(payload?.data) ? payload.data.map(asRecord).filter(Boolean) : [];
};

const updateLocaleStatus = async (recordIdentifier, statsPayload) => {
  if (!STRAPI_API_TOKEN || !UPDATE_STATUS) return;
  if (!recordIdentifier) return;

  const url = `${STRAPI_BASE_URL}/api/ui-locales/${recordIdentifier}`;
  const body = {
    data: {
      deploy_required: false,
      last_exported_at: new Date().toISOString(),
      ...statsPayload,
    },
  };
  await fetchJson(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${STRAPI_API_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
};

const writeLocale = async (locale, strings) => {
  const outputPath = path.join(OUTPUT_DIR, `${locale}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(strings, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
};

const writeProgressReport = async (reportData) => {
  await fs.mkdir(path.dirname(PROGRESS_REPORT_PATH), { recursive: true });
  await fs.writeFile(PROGRESS_REPORT_PATH, `${JSON.stringify(reportData, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${PROGRESS_REPORT_PATH}`);
};

const main = async () => {
  if (!STRAPI_API_TOKEN) {
    console.error('ERROR: STRAPI_API_TOKEN is required for ui-locale export.');
    process.exit(1);
  }

  const entries = await getAllLocales();
  const exportable = [];

  for (const entry of entries) {
    const locale = entry?.ui_locale;
    if (!locale) {
      continue;
    }
    const normalized = String(locale).trim().toLowerCase();
    if (!normalized) {
      continue;
    }
    exportable.push({
      locale: normalized,
      recordIdentifier: resolveLocaleIdentifier(entry),
      strings: entry.strings || {},
      status: entry.status || 'draft',
      deploy_required: Boolean(entry.deploy_required),
      last_imported_at: entry.last_imported_at || null,
      last_exported_at: entry.last_exported_at || null,
    });
  }

  if (exportable.length === 0) {
    console.warn('WARN: no ui-locale records found in Strapi.');
  }

  exportable.sort((left, right) => left.locale.localeCompare(right.locale));

  const referenceRecord =
    exportable.find((record) => record.locale === UI_REFERENCE_LOCALE) ||
    exportable.find((record) => record.locale === 'en') ||
    null;
  const referenceLocale = referenceRecord?.locale || UI_REFERENCE_LOCALE;
  const referenceStrings = referenceRecord?.strings || {};

  const progressRows = [];

  for (const record of exportable) {
    const statsPayload = buildStatsPayload(referenceStrings, record.strings || {}, record.locale, referenceLocale);
    await writeLocale(record.locale, record.strings);
    await updateLocaleStatus(record.recordIdentifier, statsPayload);

    progressRows.push({
      ui_locale: record.locale,
      status: record.status,
      reference_locale: referenceLocale,
      deploy_required: record.deploy_required,
      last_imported_at: record.last_imported_at,
      last_exported_at: record.last_exported_at,
      ...statsPayload,
    });
  }

  await writeProgressReport({
    generated_at: new Date().toISOString(),
    reference_locale: referenceLocale,
    locales_total: progressRows.length,
    locales: progressRows,
  });

  console.log(`UI locale export complete. Exported ${exportable.length} locale file(s).`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
