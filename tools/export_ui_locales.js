#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');

const STRAPI_BASE_URL = (process.env.STRAPI_BASE_URL || 'http://127.0.0.1:1337').replace(/\/$/, '');
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '';
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), 'frontend', 'src', 'i18n');
const UPDATE_STATUS = (process.env.UPDATE_DEPLOY_STATUS || 'true').toLowerCase() !== 'false';

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
  return Array.isArray(payload?.data) ? payload.data : [];
};

const updateLocaleStatus = async (id) => {
  if (!STRAPI_API_TOKEN || !UPDATE_STATUS) return;
  const url = `${STRAPI_BASE_URL}/api/ui-locales/${id}`;
  const body = {
    data: {
      deploy_required: false,
      last_exported_at: new Date().toISOString(),
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

const main = async () => {
  if (!STRAPI_API_TOKEN) {
    console.error('ERROR: STRAPI_API_TOKEN is required for ui-locale export.');
    process.exit(1);
  }

  const entries = await getAllLocales();
  const exportable = [];

  for (const entry of entries) {
    const attributes = entry?.attributes || {};
    const locale = attributes.ui_locale;
    if (!locale) {
      continue;
    }
    const normalized = String(locale).trim().toLowerCase();
    if (!normalized) {
      continue;
    }
    exportable.push({
      locale: normalized,
      id: entry.id,
      strings: attributes.strings || {},
    });
  }

  if (exportable.length === 0) {
    console.warn('WARN: no ui-locale records found in Strapi.');
  }

  exportable.sort((left, right) => left.locale.localeCompare(right.locale));

  for (const record of exportable) {
    await writeLocale(record.locale, record.strings);
    await updateLocaleStatus(record.id);
  }

  console.log(`UI locale export complete. Exported ${exportable.length} locale file(s).`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
