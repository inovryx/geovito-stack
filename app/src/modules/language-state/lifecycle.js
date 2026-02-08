'use strict';

const { DEFAULT_LANGUAGE } = require('./constants');
const { enforceLanguageState } = require('./rules');

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

const shouldValidateOnUpdate = (data) =>
  hasOwn(data, 'translations') || hasOwn(data, 'canonical_language') || hasOwn(data, 'publishedAt');

const fetchExisting = async (uid, where) => {
  if (!where || typeof where !== 'object') return null;

  if (where.id) {
    return strapi.entityService.findOne(uid, where.id, {
      publicationState: 'preview',
      populate: ['translations'],
    });
  }

  if (where.documentId) {
    const existing = await strapi.entityService.findMany(uid, {
      publicationState: 'preview',
      filters: { documentId: where.documentId },
      populate: ['translations'],
      limit: 1,
    });

    return existing[0] || null;
  }

  return null;
};

const validateCreate = (event, contextLabel) => {
  const data = event.params?.data || {};
  enforceLanguageState(data, { contextLabel });
  event.params.data = data;
};

const validateUpdate = async (event, uid, contextLabel) => {
  const data = event.params?.data || {};

  if (!shouldValidateOnUpdate(data)) {
    return;
  }

  const existing = await fetchExisting(uid, event.params?.where);

  const merged = {
    canonical_language: data.canonical_language || existing?.canonical_language || DEFAULT_LANGUAGE,
    translations: data.translations || existing?.translations || [],
    publishedAt: hasOwn(data, 'publishedAt') ? data.publishedAt : existing?.publishedAt,
  };

  enforceLanguageState(merged, {
    contextLabel,
    requireCanonicalComplete: hasOwn(data, 'publishedAt') && Boolean(data.publishedAt),
  });

  if (hasOwn(data, 'translations')) {
    event.params.data.translations = merged.translations;
  }

  if (hasOwn(data, 'canonical_language') || hasOwn(data, 'translations')) {
    event.params.data.canonical_language = merged.canonical_language;
  }
};

const createLanguageStateLifecycle = ({ uid, contextLabel }) => ({
  beforeCreate(event) {
    validateCreate(event, contextLabel || uid);
  },
  async beforeUpdate(event) {
    await validateUpdate(event, uid, contextLabel || uid);
  },
});

module.exports = {
  createLanguageStateLifecycle,
};
