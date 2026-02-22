'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { buildReferenceRows } = require('../../../modules/ui-locale/metrics');

const UID = 'api::ui-locale.ui-locale';
const DEFAULT_REFERENCE_LOCALE = 'en';
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 300;

const normalizeLocale = (value) => String(value || '').trim().toLowerCase();

const asRecord = (entry) => {
  if (!entry) return null;
  if (entry.attributes) {
    return {
      id: entry.id,
      ...entry.attributes,
    };
  }
  return entry;
};

const normalizeReferenceStats = (stats, isReferenceLocale) => {
  if (!isReferenceLocale) return stats;
  const total = Number(stats?.total_keys || 0);
  return {
    ...stats,
    translated_keys: total,
    missing_keys: 0,
    untranslated_keys: 0,
    coverage_percent: 100,
    missing_examples: [],
    untranslated_examples: [],
  };
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const normalizeStateFilter = (value) => {
  const normalized = String(value || 'all').trim().toLowerCase();
  return new Set(['all', 'missing', 'untranslated', 'translated']).has(normalized) ? normalized : 'all';
};

const fetchLocales = async (strapi) => {
  const entries = await strapi.entityService.findMany(UID, {
    publicationState: 'preview',
    fields: [
      'ui_locale',
      'reference_locale',
      'status',
      'strings',
      'deploy_required',
      'last_imported_at',
      'last_exported_at',
      'total_keys',
      'translated_keys',
      'missing_keys',
      'untranslated_keys',
      'coverage_percent',
      'missing_examples',
      'untranslated_examples',
    ],
    limit: 500,
    sort: ['ui_locale:asc'],
  });

  return Array.isArray(entries) ? entries.map(asRecord).filter(Boolean) : [];
};

const findLocaleRecord = async (strapi, localeCode, candidates = []) => {
  const normalized = normalizeLocale(localeCode);
  if (!normalized) return null;

  const fromCandidates = candidates.find((entry) => normalizeLocale(entry.ui_locale) === normalized);
  if (fromCandidates) return fromCandidates;

  const entries = await strapi.entityService.findMany(UID, {
    publicationState: 'preview',
    filters: { ui_locale: normalized },
    fields: ['ui_locale', 'reference_locale', 'status', 'strings', 'deploy_required', 'last_imported_at', 'last_exported_at'],
    limit: 1,
  });

  return asRecord(entries?.[0] || null);
};

const pickReferenceRecord = async (strapi, requestedReferenceLocale, allLocales) => {
  const normalized = normalizeLocale(requestedReferenceLocale || DEFAULT_REFERENCE_LOCALE) || DEFAULT_REFERENCE_LOCALE;
  const requested = await findLocaleRecord(strapi, normalized, allLocales);
  if (requested) {
    return {
      locale: normalized,
      record: requested,
    };
  }

  const fallback = normalized !== DEFAULT_REFERENCE_LOCALE ? await findLocaleRecord(strapi, DEFAULT_REFERENCE_LOCALE, allLocales) : null;
  if (fallback) {
    return {
      locale: DEFAULT_REFERENCE_LOCALE,
      record: fallback,
    };
  }

  return null;
};

module.exports = createCoreController(UID, ({ strapi }) => ({
  async progress(ctx) {
    const locales = await fetchLocales(strapi);
    const requestedReference = normalizeLocale(ctx.query?.reference_locale || DEFAULT_REFERENCE_LOCALE);
    const referenceBundle = await pickReferenceRecord(strapi, requestedReference, locales);

    if (!referenceBundle?.record) {
      return ctx.badRequest(`reference locale "${requestedReference}" was not found.`);
    }

    const referenceLocale = referenceBundle.locale;
    const referenceStrings = referenceBundle.record.strings || {};

    const rows = locales
      .map((entry) => {
        const localeCode = normalizeLocale(entry.ui_locale);
        const statsPayload = buildReferenceRows(referenceStrings, entry.strings || {}, { state: 'all' }).stats;
        const stats = normalizeReferenceStats(statsPayload, localeCode === referenceLocale);

        return {
          ui_locale: localeCode,
          status: entry.status || 'draft',
          reference_locale: referenceLocale,
          deploy_required: Boolean(entry.deploy_required),
          total_keys: stats.total_keys,
          translated_keys: stats.translated_keys,
          missing_keys: stats.missing_keys,
          untranslated_keys: stats.untranslated_keys,
          coverage_percent: stats.coverage_percent,
          missing_examples: stats.missing_examples,
          untranslated_examples: stats.untranslated_examples,
          last_imported_at: entry.last_imported_at || null,
          last_exported_at: entry.last_exported_at || null,
        };
      })
      .sort((left, right) => left.ui_locale.localeCompare(right.ui_locale));

    const summary = {
      locales_total: rows.length,
      reference_locale: referenceLocale,
      locales_complete: rows.filter((item) => item.status === 'complete').length,
      locales_with_gaps: rows.filter((item) => item.missing_keys > 0 || item.untranslated_keys > 0).length,
      locales_with_missing: rows.filter((item) => item.missing_keys > 0).length,
      locales_with_untranslated: rows.filter((item) => item.untranslated_keys > 0).length,
      deploy_required_count: rows.filter((item) => item.deploy_required).length,
    };

    ctx.body = {
      data: {
        summary,
        locales: rows,
      },
    };
  },

  async referencePreview(ctx) {
    const localeKey = normalizeLocale(ctx.params?.localeKey);
    if (!localeKey) {
      return ctx.badRequest('localeKey is required.');
    }

    const locales = await fetchLocales(strapi);
    const targetLocale = await findLocaleRecord(strapi, localeKey, locales);
    if (!targetLocale) {
      return ctx.notFound(`ui-locale "${localeKey}" was not found.`);
    }

    const requestedReference = normalizeLocale(ctx.query?.reference_locale || targetLocale.reference_locale || DEFAULT_REFERENCE_LOCALE);
    const referenceBundle = await pickReferenceRecord(strapi, requestedReference, locales);
    if (!referenceBundle?.record) {
      return ctx.badRequest(`reference locale "${requestedReference}" was not found.`);
    }

    const referenceLocale = referenceBundle.locale;
    const referenceStrings = referenceBundle.record.strings || {};
    const state = normalizeStateFilter(ctx.query?.state);
    const limit = Math.min(parsePositiveInt(ctx.query?.limit, DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const offset = parsePositiveInt(ctx.query?.offset, 0);

    const result = buildReferenceRows(referenceStrings, targetLocale.strings || {}, { state });
    const stats = normalizeReferenceStats(result.stats, localeKey === referenceLocale);
    const slicedRows = result.rows.slice(offset, offset + limit);

    ctx.body = {
      data: {
        ui_locale: localeKey,
        reference_locale: referenceLocale,
        filters: { state },
        pagination: {
          offset,
          limit,
          total: result.rows.length,
          returned: slicedRows.length,
        },
        stats,
        rows: slicedRows,
      },
    };
  },
}));
