'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { SUPPORTED_LANGUAGES } = require('../../../modules/language-state/constants');
const {
  DEFAULT_REFERENCE_LOCALE,
  SYSTEM_PAGE_KEYS,
  normalizePageKey,
  isSupportedSystemPageKey,
  buildSystemPagePath,
} = require('../../../modules/ui-pages/constants');

const UID = 'api::ui-page.ui-page';
const SUPPORTED_LANGUAGE_SET = new Set(SUPPORTED_LANGUAGES);

const normalizeLanguage = (value) => String(value || '').trim().toLowerCase();

const normalizeStatus = (value) => {
  if (value === 'complete' || value === 'draft' || value === 'missing') return value;
  return 'missing';
};

const normalizeTranslationList = (translations) => (Array.isArray(translations) ? translations : []);

const makeEmptyStatusMap = () => {
  const output = {};
  for (const language of SUPPORTED_LANGUAGES) {
    output[language] = 'missing';
  }
  return output;
};

const countValues = (statusByLanguage, value) =>
  Object.values(statusByLanguage).reduce((count, status) => (status === value ? count + 1 : count), 0);

const getLocaleCoverage = (pages, locale) => {
  const totalPages = pages.length;
  const completePages = pages.filter((page) => page.status_by_language[locale] === 'complete').length;
  const draftPages = pages.filter((page) => page.status_by_language[locale] === 'draft').length;
  const missingPages = pages.filter((page) => page.status_by_language[locale] === 'missing').length;
  const coveragePercent = totalPages > 0 ? Number(((completePages / totalPages) * 100).toFixed(2)) : 100;

  return {
    language: locale,
    total_pages: totalPages,
    complete_pages: completePages,
    draft_pages: draftPages,
    missing_pages: missingPages,
    coverage_percent: coveragePercent,
  };
};

const findPageByKey = async (strapi, pageKey) => {
  const entries = await strapi.entityService.findMany(UID, {
    publicationState: 'preview',
    filters: { page_key: pageKey },
    populate: ['translations'],
    fields: ['page_key', 'canonical_language', 'mock'],
    limit: 1,
  });
  return entries[0] || null;
};

const findTranslation = (translations, language) =>
  normalizeTranslationList(translations).find((entry) => normalizeLanguage(entry.language) === language) || null;

const pickReferenceLanguage = (page, requested) => {
  const requestedLanguage = normalizeLanguage(requested || page?.canonical_language || DEFAULT_REFERENCE_LOCALE);
  if (SUPPORTED_LANGUAGE_SET.has(requestedLanguage)) return requestedLanguage;
  return DEFAULT_REFERENCE_LOCALE;
};

module.exports = createCoreController(UID, ({ strapi }) => ({
  async progress(ctx) {
    const entries = await strapi.entityService.findMany(UID, {
      publicationState: 'preview',
      populate: ['translations'],
      fields: ['page_key', 'canonical_language', 'mock', 'publishedAt'],
      sort: ['page_key:asc'],
      limit: 200,
    });

    const pages = (Array.isArray(entries) ? entries : [])
      .map((entry) => {
        const pageKey = normalizePageKey(entry.page_key);
        if (!isSupportedSystemPageKey(pageKey)) return null;

        const statusByLanguage = makeEmptyStatusMap();
        for (const translation of normalizeTranslationList(entry.translations)) {
          const language = normalizeLanguage(translation.language);
          if (!SUPPORTED_LANGUAGE_SET.has(language)) continue;
          statusByLanguage[language] = normalizeStatus(translation.status);
        }

        const missingLocales = SUPPORTED_LANGUAGES.filter((language) => statusByLanguage[language] === 'missing');
        const draftLocales = SUPPORTED_LANGUAGES.filter((language) => statusByLanguage[language] === 'draft');
        const completeLocales = SUPPORTED_LANGUAGES.filter((language) => statusByLanguage[language] === 'complete');

        return {
          page_key: pageKey,
          canonical_language: normalizeLanguage(entry.canonical_language || DEFAULT_REFERENCE_LOCALE),
          published: Boolean(entry.publishedAt),
          mock: Boolean(entry.mock),
          status_by_language: statusByLanguage,
          missing_locales: missingLocales,
          draft_locales: draftLocales,
          complete_locales: completeLocales,
          missing_count: missingLocales.length,
          draft_count: draftLocales.length,
          complete_count: completeLocales.length,
        };
      })
      .filter(Boolean);

    const localeCoverage = SUPPORTED_LANGUAGES.map((language) => getLocaleCoverage(pages, language));

    ctx.body = {
      data: {
        reference_language: DEFAULT_REFERENCE_LOCALE,
        supported_page_keys: SYSTEM_PAGE_KEYS,
        totals: {
          pages: pages.length,
          fully_complete_pages: pages.filter((page) => page.missing_count === 0 && page.draft_count === 0).length,
          pages_with_missing: pages.filter((page) => page.missing_count > 0).length,
          pages_with_draft: pages.filter((page) => page.draft_count > 0).length,
        },
        locale_coverage: localeCoverage,
        pages,
      },
    };
  },

  async referencePreview(ctx) {
    const pageKey = normalizePageKey(ctx.params?.pageKey);
    if (!isSupportedSystemPageKey(pageKey)) {
      return ctx.badRequest(`pageKey must be one of: ${SYSTEM_PAGE_KEYS.join(', ')}`);
    }

    const page = await findPageByKey(strapi, pageKey);
    if (!page) {
      return ctx.notFound(`ui-page not found: ${pageKey}`);
    }

    const targetLanguage = normalizeLanguage(ctx.query?.locale || '');
    if (!SUPPORTED_LANGUAGE_SET.has(targetLanguage)) {
      return ctx.badRequest(`locale must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
    }

    const referenceLanguage = pickReferenceLanguage(page, ctx.query?.reference_locale);
    const reference = findTranslation(page.translations, referenceLanguage);
    const target = findTranslation(page.translations, targetLanguage);

    const response = {
      page_key: pageKey,
      target_locale: targetLanguage,
      reference_locale: referenceLanguage,
      mock: Boolean(page.mock),
      target_status: normalizeStatus(target?.status),
      reference_status: normalizeStatus(reference?.status),
      expected_paths: {
        target: buildSystemPagePath(targetLanguage, pageKey),
        reference: buildSystemPagePath(referenceLanguage, pageKey),
      },
      fields: {
        title: {
          reference: reference?.title || '',
          target: target?.title || '',
          missing: !String(target?.title || '').trim(),
        },
        excerpt: {
          reference: reference?.excerpt || '',
          target: target?.excerpt || '',
          missing: !String(target?.excerpt || '').trim(),
        },
        body: {
          reference: reference?.body || '',
          target: target?.body || '',
          missing: !String(target?.body || '').trim(),
        },
        seo_meta_title: {
          reference: reference?.seo?.metaTitle || '',
          target: target?.seo?.metaTitle || '',
          missing: !String(target?.seo?.metaTitle || '').trim(),
        },
        seo_meta_description: {
          reference: reference?.seo?.metaDescription || '',
          target: target?.seo?.metaDescription || '',
          missing: !String(target?.seo?.metaDescription || '').trim(),
        },
      },
      translation_presence: {
        target_exists: Boolean(target),
        reference_exists: Boolean(reference),
      },
    };

    const missingFieldCount = Object.values(response.fields).reduce(
      (count, field) => (field.missing ? count + 1 : count),
      0
    );

    ctx.body = {
      data: {
        ...response,
        missing_field_count: missingFieldCount,
      },
    };
  },
}));
