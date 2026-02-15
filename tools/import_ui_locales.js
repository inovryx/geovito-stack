#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');

const STRAPI_BASE_URL = (process.env.STRAPI_BASE_URL || 'http://127.0.0.1:1337').replace(/\/$/, '');
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '';
const INPUT_DIR = process.env.INPUT_DIR || path.join(process.cwd(), 'artifacts', 'ui-locales');
const DEFAULT_STATUS = process.env.UI_LOCALE_STATUS || 'draft';

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
  return Array.isArray(payload?.data) ? payload.data[0] : null;
};

const upsertLocale = async (locale, strings) => {
  const existing = await findLocale(locale);
  const nowIso = new Date().toISOString();
  const payload = {
    data: {
      ui_locale: locale,
      status: DEFAULT_STATUS,
      strings,
      deploy_required: true,
      last_imported_at: nowIso,
    },
  };

  if (existing?.id) {
    await fetchJson(`${STRAPI_BASE_URL}/api/ui-locales/${existing.id}`, {
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

  for (const item of localeFiles) {
    const locale = item.locale;
    const filePath = path.join(INPUT_DIR, item.file);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const strings = JSON.parse(raw);
      await upsertLocale(locale, strings);
    } catch (error) {
      console.error(`WARN: skip ${locale} (${error.message})`);
    }
  }

  console.log(`UI locale import complete. Processed ${localeFiles.length} locale file(s).`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
