'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');
const BLOG_POST_UID = 'api::blog-post.blog-post';
const PAGE_SIZE = 100;

const createAppInstance = async () => {
  const app = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });
  await app.load();
  return app;
};

const normalizeSource = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'user') return 'user';
  return 'editorial';
};

const normalizeState = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['draft', 'submitted', 'approved', 'rejected', 'spam', 'deleted'].includes(normalized) ? normalized : null;
};

const run = async () => {
  const strapi = await createAppInstance();
  let start = 0;
  let scanned = 0;
  let updated = 0;

  try {
    while (true) {
      const rows = await strapi.entityService.findMany(BLOG_POST_UID, {
        publicationState: 'preview',
        fields: ['id', 'post_id', 'content_source', 'submission_state', 'owner_user_id', 'owner_username_snapshot', 'publishedAt'],
        sort: ['id:asc'],
        start,
        limit: PAGE_SIZE,
      });

      if (!Array.isArray(rows) || rows.length === 0) break;

      for (const row of rows) {
        scanned += 1;
        const normalizedSource = normalizeSource(row.content_source);
        const normalizedState = normalizeState(row.submission_state);
        const data = {};

        if (row.content_source !== normalizedSource) {
          data.content_source = normalizedSource;
        }

        let nextState = normalizedState;
        if (!nextState) {
          nextState = normalizedSource === 'user' ? 'draft' : 'approved';
          data.submission_state = nextState;
        }

        if (normalizedSource === 'editorial' && row.publishedAt && nextState !== 'approved') {
          data.submission_state = 'approved';
        }

        if (normalizedSource === 'editorial') {
          if (row.owner_user_id !== null && row.owner_user_id !== undefined) data.owner_user_id = null;
          if (row.owner_username_snapshot) data.owner_username_snapshot = null;
          data.owner_user = null;
        }

        if (Object.keys(data).length > 0) {
          await strapi.entityService.update(BLOG_POST_UID, Number(row.id), { data });
          updated += 1;
          console.log(`updated post_id=${row.post_id || row.id} -> ${JSON.stringify(data)}`);
        }
      }

      start += rows.length;
      if (rows.length < PAGE_SIZE) break;
    }

    console.log(`blog-post ugc backfill done: scanned=${scanned} updated=${updated}`);
  } finally {
    await strapi.destroy();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
