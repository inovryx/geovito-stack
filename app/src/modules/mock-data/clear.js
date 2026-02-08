'use strict';

const getStrapi = (strapiInstance) => {
  if (strapiInstance) return strapiInstance;
  if (global.strapi) return global.strapi;
  throw new Error('Strapi instance is required');
};

const listByMockFlag = async (strapiInstance, uid) => {
  const app = getStrapi(strapiInstance);
  const all = [];
  const pageSize = 100;
  let start = 0;

  while (true) {
    const batch = await app.entityService.findMany(uid, {
      publicationState: 'preview',
      filters: { mock: true },
      limit: pageSize,
      start,
    });

    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    all.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    start += pageSize;
  }

  return all;
};

const deleteByMockFlag = async (strapiInstance, uid) => {
  const app = getStrapi(strapiInstance);
  const entries = await listByMockFlag(app, uid);
  for (const entry of entries) {
    await app.entityService.delete(uid, entry.id);
  }
  return entries.length;
};

const clearMockData = async (strapiInstance) => {
  const app = getStrapi(strapiInstance);
  const plan = [
    'api::atlas-suggestion.atlas-suggestion',
    'api::blog-post.blog-post',
    'api::ui-page.ui-page',
    'api::atlas-place.atlas-place',
    'api::gazetteer-entry.gazetteer-entry',
    'api::import-batch.import-batch',
  ];

  const summary = {};

  for (const uid of plan) {
    summary[uid] = await deleteByMockFlag(app, uid);
  }

  return summary;
};

module.exports = {
  clearMockData,
};
