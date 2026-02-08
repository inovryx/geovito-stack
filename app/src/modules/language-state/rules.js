'use strict';

const { DEFAULT_LANGUAGE, LANGUAGE_STATUS, SUPPORTED_LANGUAGES } = require('./constants');

const SUPPORTED_LANGUAGE_SET = new Set(SUPPORTED_LANGUAGES);
const STATUS_SET = new Set(Object.values(LANGUAGE_STATUS));

const isBlank = (value) => typeof value !== 'string' || value.trim().length === 0;

const normalizeLanguage = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const normalizeSlug = (value) => {
  if (typeof value !== 'string') return value;
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const normalizeTranslation = (translation, index) => {
  const candidate = {
    ...translation,
    language: normalizeLanguage(translation.language),
    status: translation.status || LANGUAGE_STATUS.MISSING,
    runtime_translation: Boolean(translation.runtime_translation),
  };

  if (!SUPPORTED_LANGUAGE_SET.has(candidate.language)) {
    throw new Error(
      `translations[${index}].language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}. Received: ${JSON.stringify(candidate.language)}. Payload: ${JSON.stringify(translation)}`
    );
  }

  if (!STATUS_SET.has(candidate.status)) {
    throw new Error(
      `translations[${index}].status must be one of: ${Object.values(LANGUAGE_STATUS).join(', ')}`
    );
  }

  if (typeof candidate.slug === 'string') {
    candidate.slug = normalizeSlug(candidate.slug);
  }

  if (candidate.status === LANGUAGE_STATUS.COMPLETE) {
    if (isBlank(candidate.title)) {
      throw new Error(`translations[${index}].title is required when status=complete`);
    }
    if (isBlank(candidate.slug)) {
      throw new Error(`translations[${index}].slug is required when status=complete`);
    }
    if (isBlank(candidate.body)) {
      throw new Error(`translations[${index}].body is required when status=complete`);
    }
  }

  if (candidate.status !== LANGUAGE_STATUS.COMPLETE || candidate.runtime_translation) {
    candidate.indexable = false;
  } else {
    candidate.indexable = true;
  }

  return candidate;
};

const ensureUniqueLanguages = (translations) => {
  const seen = new Set();
  translations.forEach((translation, index) => {
    if (seen.has(translation.language)) {
      throw new Error(`translations[${index}].language duplicates another translation (${translation.language})`);
    }
    seen.add(translation.language);
  });
};

const ensureCanonicalComplete = (translations, canonicalLanguage, contextLabel) => {
  const canonicalTranslation = translations.find((translation) => translation.language === canonicalLanguage);

  if (!canonicalTranslation) {
    throw new Error(`${contextLabel}: canonical language (${canonicalLanguage}) is missing from translations`);
  }

  if (canonicalTranslation.status !== LANGUAGE_STATUS.COMPLETE) {
    throw new Error(
      `${contextLabel}: canonical language (${canonicalLanguage}) must have status=complete before publishing`
    );
  }

  if (canonicalTranslation.runtime_translation) {
    throw new Error(`${contextLabel}: canonical language (${canonicalLanguage}) cannot be runtime translation`);
  }
};

const enforceLanguageState = (data, options = {}) => {
  const contextLabel = options.contextLabel || 'entry';

  if (!Array.isArray(data.translations) || data.translations.length === 0) {
    throw new Error(`${contextLabel}: translations is required and must contain at least one language`);
  }

  const looksLikeComponentReference = data.translations.every(
    (item) => item && typeof item === 'object' && 'id' in item && !('language' in item)
  );

  // Strapi can pass component link references during internal document writes.
  // In that case we trust previously validated content and skip normalization.
  if (looksLikeComponentReference) {
    return data;
  }

  const canonicalLanguage = normalizeLanguage(data.canonical_language || DEFAULT_LANGUAGE);

  if (!SUPPORTED_LANGUAGE_SET.has(canonicalLanguage)) {
    throw new Error(`${contextLabel}: canonical_language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  const normalizedTranslations = data.translations.map(normalizeTranslation);
  ensureUniqueLanguages(normalizedTranslations);

  const requireCanonicalComplete =
    Boolean(options.requireCanonicalComplete) || Boolean(data.publishedAt || data.published_at);

  if (requireCanonicalComplete) {
    ensureCanonicalComplete(normalizedTranslations, canonicalLanguage, contextLabel);
  }

  data.canonical_language = canonicalLanguage;
  data.translations = normalizedTranslations;

  return data;
};

const resolveCompleteTranslation = (translations, preferredLanguage, canonicalLanguage = DEFAULT_LANGUAGE) => {
  const preferred = translations.find(
    (translation) => translation.language === preferredLanguage && translation.status === LANGUAGE_STATUS.COMPLETE
  );

  if (preferred) return preferred;

  const canonical = translations.find(
    (translation) => translation.language === canonicalLanguage && translation.status === LANGUAGE_STATUS.COMPLETE
  );

  if (canonical) return canonical;

  return translations.find((translation) => translation.status === LANGUAGE_STATUS.COMPLETE) || null;
};

module.exports = {
  enforceLanguageState,
  resolveCompleteTranslation,
};
