'use strict';

const { createLanguageStateLifecycle } = require('../../../../modules/language-state');
const { SUPPORTED_LANGUAGES } = require('../../../../modules/language-state/constants');
const {
  DEFAULT_REFERENCE_LOCALE,
  SYSTEM_PAGE_KEYS,
  normalizePageKey,
  isSupportedSystemPageKey,
  buildSystemPagePath,
} = require('../../../../modules/ui-pages/constants');

const UID = 'api::ui-page.ui-page';
const SUPPORTED_LANGUAGE_SET = new Set(SUPPORTED_LANGUAGES);

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const normalizeLanguage = (value) => String(value || '').trim().toLowerCase();

const fetchExisting = async (where) => {
  if (!where || typeof where !== 'object') return null;

  if (where.id) {
    return strapi.entityService.findOne(UID, where.id, {
      publicationState: 'preview',
      populate: ['translations'],
    });
  }

  if (where.documentId) {
    const existing = await strapi.entityService.findMany(UID, {
      publicationState: 'preview',
      filters: { documentId: where.documentId },
      populate: ['translations'],
      limit: 1,
    });
    return existing[0] || null;
  }

  return null;
};

const normalizeSystemTranslations = (translations, pageKey) => {
  if (!Array.isArray(translations)) return [];

  return translations.map((translation) => {
    if (!isRecord(translation)) return translation;

    const language = normalizeLanguage(translation.language);
    if (!SUPPORTED_LANGUAGE_SET.has(language)) {
      return translation;
    }

    return {
      ...translation,
      slug: pageKey,
      canonical_path: buildSystemPagePath(language, pageKey),
    };
  });
};

const enforceSystemPageRules = (event, existing = null) => {
  const data = event.params?.data || {};

  const pageKey = normalizePageKey(data.page_key || existing?.page_key);
  if (!pageKey) {
    throw new Error(`ui-page: page_key is required (${SYSTEM_PAGE_KEYS.join(', ')})`);
  }

  if (!isSupportedSystemPageKey(pageKey)) {
    throw new Error(`ui-page: page_key must be one of ${SYSTEM_PAGE_KEYS.join(', ')}`);
  }

  data.page_key = pageKey;

  const canonicalLanguage = normalizeLanguage(
    data.canonical_language || existing?.canonical_language || DEFAULT_REFERENCE_LOCALE
  );
  if (!SUPPORTED_LANGUAGE_SET.has(canonicalLanguage)) {
    throw new Error(`ui-page: canonical_language must be one of ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  data.canonical_language = canonicalLanguage;

  if (hasOwn(data, 'translations')) {
    data.translations = normalizeSystemTranslations(data.translations, pageKey);
  } else if (hasOwn(data, 'page_key') && Array.isArray(existing?.translations)) {
    // If page_key changes, keep existing translations consistent with fixed system slug paths.
    data.translations = normalizeSystemTranslations(existing.translations, pageKey);
  }

  event.params.data = data;
};

const languageLifecycle = createLanguageStateLifecycle({
  uid: UID,
  contextLabel: 'ui-page',
});

module.exports = {
  beforeCreate(event) {
    enforceSystemPageRules(event, null);
    languageLifecycle.beforeCreate(event);
  },
  async beforeUpdate(event) {
    const existing = await fetchExisting(event.params?.where);
    enforceSystemPageRules(event, existing);
    await languageLifecycle.beforeUpdate(event);
  },
};
