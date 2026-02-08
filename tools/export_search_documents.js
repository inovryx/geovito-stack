#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');

const STRAPI_BASE_URL = (process.env.STRAPI_BASE_URL || 'http://127.0.0.1:1337').replace(/\/$/, '');
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '';
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://www.geovito.com').replace(/\/$/, '');
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(process.cwd(), 'artifacts/search/atlas-documents.json');

const normalizeToken = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, ' ')
    .trim();

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const toAbsoluteUrl = (urlPath) => {
  const value = String(urlPath || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${PUBLIC_SITE_URL}${value.startsWith('/') ? value : `/${value}`}`;
};

const fetchJson = async (requestPath, query = {}) => {
  const url = new URL(`${STRAPI_BASE_URL}${requestPath}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }

  const headers = { Accept: 'application/json' };
  if (STRAPI_API_TOKEN) {
    headers.Authorization = `Bearer ${STRAPI_API_TOKEN}`;
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url.toString()}`);
  }
  return response.json();
};

const asEntity = (entry) => {
  if (!entry) return null;
  if (entry.attributes) {
    return {
      id: entry.id,
      ...entry.attributes,
    };
  }
  return entry;
};

const fetchAllAtlasPlaces = async () => {
  const list = [];
  const pageSize = 200;
  let page = 1;
  let pageCount = 1;

  while (page <= pageCount) {
    const payload = await fetchJson('/api/atlas-places', {
      'populate[0]': 'translations',
      'populate[1]': 'parent',
      'pagination[page]': page,
      'pagination[pageSize]': pageSize,
    });

    const entities = Array.isArray(payload?.data) ? payload.data.map(asEntity) : [];
    list.push(...entities);

    pageCount = Number(payload?.meta?.pagination?.pageCount || page);
    page += 1;
  }

  return list;
};

const buildAtlasDocument = (place, translation) => {
  const parentPlaceId = place.parent_place_id || place.parent?.place_id || null;
  const documentId = `${place.place_id}:${translation.language}`;
  const url = translation.canonical_path
    ? toAbsoluteUrl(translation.canonical_path)
    : toAbsoluteUrl(`/${translation.language}/atlas/${translation.slug}/`);

  const normalizedTokens = unique(
    [translation.title, translation.slug, place.country_code, place.place_id, parentPlaceId]
      .map(normalizeToken)
      .flatMap((value) => value.split(/\s+/g))
  );

  const isMock = place.mock === true;

  return {
    document_id: documentId,
    document: {
      domain: 'atlas',
      document_id: documentId,
      place_id: place.place_id,
      place_type: place.place_type,
      language: translation.language,
      canonical_language: place.canonical_language,
      title: translation.title,
      slug: translation.slug,
      url,
      country_code: place.country_code,
      parent_place_id: parentPlaceId,
      aliases: [],
      normalized_tokens: normalizedTokens,
      is_indexable: translation.indexable === true && !isMock,
      updated_at: place.updatedAt || new Date().toISOString(),
    },
    meta: {
      mock: isMock,
    },
  };
};

const main = async () => {
  const places = await fetchAllAtlasPlaces();
  const records = [];

  for (const place of places) {
    const translations = Array.isArray(place.translations) ? place.translations : [];
    for (const translation of translations) {
      if (translation?.status !== 'complete') continue;
      if (!translation?.title || !translation?.slug) continue;
      records.push(buildAtlasDocument(place, translation));
    }
  }

  const output = {
    generated_at: new Date().toISOString(),
    source: STRAPI_BASE_URL,
    contract: 'services/search-indexer/contracts/atlas-document.v1.schema.json',
    counts: {
      total_documents: records.length,
      indexable_documents: records.filter((item) => item.document.is_indexable).length,
      mock_documents: records.filter((item) => item.meta.mock).length,
    },
    mock_document_ids: records.filter((item) => item.meta.mock).map((item) => item.document_id),
    documents: records.map((item) => item.document),
    document_meta: records.map((item) => ({
      document_id: item.document_id,
      mock: item.meta.mock,
    })),
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        output: OUTPUT_PATH,
        counts: output.counts,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
