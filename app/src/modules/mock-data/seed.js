'use strict';

const {
  atlasPlaces,
  blogPosts,
  uiPages,
  gazetteerEntries,
  importBatches,
  atlasSuggestions,
} = require('./dataset');

const now = () => new Date();

const getStrapi = (strapiInstance) => {
  if (strapiInstance) return strapiInstance;
  if (global.strapi) return global.strapi;
  throw new Error('Strapi instance is required');
};

const findOneByField = async (strapiInstance, uid, field, value, options = {}) => {
  const app = getStrapi(strapiInstance);
  const entries = await app.entityService.findMany(uid, {
    publicationState: 'preview',
    filters: { [field]: value },
    populate: options.populate || [],
    limit: 1,
  });

  return entries[0] || null;
};

const upsert = async (strapiInstance, uid, uniqueField, uniqueValue, payload, options = {}) => {
  const app = getStrapi(strapiInstance);
  const existing = await findOneByField(app, uid, uniqueField, uniqueValue, options);
  const data = { ...payload };

  if (options.publish) {
    data.publishedAt = existing?.publishedAt || now();
  }

  if (existing) {
    return app.entityService.update(uid, existing.id, { data });
  }

  return app.entityService.create(uid, { data });
};

const seedUiPages = async (strapiInstance) => {
  for (const page of uiPages) {
    await upsert(strapiInstance, 'api::ui-page.ui-page', 'page_key', page.page_key, page, {
      publish: true,
    });
  }
};

const seedAtlasPlaces = async (strapiInstance) => {
  const app = getStrapi(strapiInstance);
  const placeMap = new Map();

  for (const place of atlasPlaces) {
    const payload = { ...place };
    const parentPlaceId = payload.parent_place_id;

    if (parentPlaceId) {
      const parentEntry =
        placeMap.get(parentPlaceId) ||
        (await findOneByField(app, 'api::atlas-place.atlas-place', 'place_id', parentPlaceId));
      if (!parentEntry) {
        throw new Error(`Cannot seed place ${place.place_id}: parent ${parentPlaceId} not found`);
      }
      payload.parent = parentEntry.id;
      payload.parent_place_id = parentEntry.place_id;
    }

    const upserted = await upsert(
      app,
      'api::atlas-place.atlas-place',
      'place_id',
      place.place_id,
      payload,
      {
        publish: true,
        populate: ['parent'],
      }
    );

    placeMap.set(place.place_id, upserted);
  }

  return placeMap;
};

const seedBlogPosts = async (strapiInstance, placeMap) => {
  const app = getStrapi(strapiInstance);
  for (const post of blogPosts) {
    const payload = { ...post };
    const relatedPlaceIds = payload.related_place_ids || [];
    delete payload.related_place_ids;

    payload.related_place_refs = relatedPlaceIds;
    payload.related_places = relatedPlaceIds
      .map((placeId) => placeMap.get(placeId)?.id)
      .filter(Boolean);

    await upsert(app, 'api::blog-post.blog-post', 'post_id', post.post_id, payload, {
      publish: true,
      populate: ['related_places'],
    });
  }
};

const seedGazetteerEntries = async (strapiInstance) => {
  const app = getStrapi(strapiInstance);
  for (const entry of gazetteerEntries) {
    await upsert(app, 'api::gazetteer-entry.gazetteer-entry', 'record_id', entry.record_id, entry);
  }
};

const seedImportBatches = async (strapiInstance) => {
  const app = getStrapi(strapiInstance);
  for (const batch of importBatches) {
    await upsert(app, 'api::import-batch.import-batch', 'batch_id', batch.batch_id, batch);
  }
};

const seedAtlasSuggestions = async (strapiInstance, placeMap) => {
  const app = getStrapi(strapiInstance);

  for (const suggestion of atlasSuggestions) {
    const existing = await findOneByField(
      app,
      'api::atlas-suggestion.atlas-suggestion',
      'suggestion_id',
      suggestion.suggestion_id,
      { populate: ['target_place'] }
    );

    if (existing) {
      continue;
    }

    const payload = { ...suggestion };
    const targetPlaceRef = payload.target_place_ref;

    if (targetPlaceRef) {
      const targetEntry =
        placeMap.get(targetPlaceRef) ||
        (await findOneByField(app, 'api::atlas-place.atlas-place', 'place_id', targetPlaceRef));
      if (targetEntry) {
        payload.target_place = targetEntry.id;
      }
    }

    await app.entityService.create('api::atlas-suggestion.atlas-suggestion', { data: payload });
  }
};

const seedMockData = async (strapiInstance) => {
  const app = getStrapi(strapiInstance);
  await seedUiPages(app);
  const placeMap = await seedAtlasPlaces(app);
  await seedBlogPosts(app, placeMap);
  await seedAtlasSuggestions(app, placeMap);
  await seedGazetteerEntries(app);
  await seedImportBatches(app);
};

module.exports = {
  seedMockData,
};
