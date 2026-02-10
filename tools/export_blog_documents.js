#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');

const STRAPI_BASE_URL = (process.env.STRAPI_BASE_URL || 'http://127.0.0.1:1337').replace(/\/$/, '');
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '';
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://www.geovito.com').replace(/\/$/, '');
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(process.cwd(), 'artifacts/search/blog-documents.json');
const DEFAULT_INDEX_LANGUAGE = 'en';

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

const fetchAllBlogPosts = async () => {
  const list = [];
  const pageSize = 200;
  let page = 1;
  let pageCount = 1;

  while (page <= pageCount) {
    const payload = await fetchJson('/api/blog-posts', {
      'populate[0]': 'translations',
      'filters[publishedAt][$notNull]': 'true',
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

const buildBlogDocument = (post, translation) => {
  const documentId = `${post.post_id}:${translation.language}`;
  const url = translation.canonical_path
    ? toAbsoluteUrl(translation.canonical_path)
    : toAbsoluteUrl(`/${translation.language}/blog/${translation.slug}/`);

  return {
    document_id: documentId,
    domain: 'blog',
    post_id: post.post_id,
    language: translation.language,
    canonical_language: post.canonical_language,
    title: translation.title,
    slug: translation.slug,
    excerpt: translation.excerpt || '',
    body: translation.body || '',
    url,
    tags: Array.isArray(post.tags) ? post.tags : [],
    related_place_refs: Array.isArray(post.related_place_refs) ? post.related_place_refs : [],
    is_indexable: translation.language === DEFAULT_INDEX_LANGUAGE && !post.mock,
    mock: Boolean(post.mock),
    updated_at: post.updatedAt || new Date().toISOString(),
  };
};

const main = async () => {
  const posts = await fetchAllBlogPosts();
  const documents = [];

  for (const post of posts) {
    const translations = Array.isArray(post.translations) ? post.translations : [];
    for (const translation of translations) {
      if (translation?.status !== 'complete') continue;
      if (translation?.language !== DEFAULT_INDEX_LANGUAGE) continue;
      if (!translation?.title || !translation?.slug) continue;
      documents.push(buildBlogDocument(post, translation));
    }
  }

  const output = {
    generated_at: new Date().toISOString(),
    source: STRAPI_BASE_URL,
    counts: {
      total_documents: documents.length,
      indexable_documents: documents.filter((item) => item.is_indexable).length,
      mock_documents: documents.filter((item) => item.mock).length,
    },
    documents,
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
