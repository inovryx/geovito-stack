'use strict';

const { computeTranslationStats } = require('../../../../modules/ui-locale/metrics');

const UID = 'api::ui-locale.ui-locale';
const DEFAULT_REFERENCE_LOCALE = 'en';

const METRIC_FIELDS = new Set([
  'total_keys',
  'translated_keys',
  'missing_keys',
  'untranslated_keys',
  'coverage_percent',
  'missing_examples',
  'untranslated_examples',
]);

const EXPORT_SAFE_FIELDS = new Set(['deploy_required', 'last_exported_at', 'last_imported_at', ...METRIC_FIELDS]);
const CONTENT_FIELDS = new Set(['ui_locale', 'reference_locale', 'status', 'strings', 'notes']);

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

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
    coverage_percent: total > 0 ? 100 : 100,
    missing_examples: [],
    untranslated_examples: [],
  };
};

const applyStatsToData = (data, stats) => {
  data.total_keys = stats.total_keys;
  data.translated_keys = stats.translated_keys;
  data.missing_keys = stats.missing_keys;
  data.untranslated_keys = stats.untranslated_keys;
  data.coverage_percent = stats.coverage_percent;
  data.missing_examples = stats.missing_examples;
  data.untranslated_examples = stats.untranslated_examples;
};

const shouldMarkDeployRequired = (data) => {
  if (!isRecord(data)) return false;
  const keys = Object.keys(data);
  if (!keys.length) return false;

  if (keys.some((key) => CONTENT_FIELDS.has(key))) {
    return true;
  }

  if (data.deploy_required === true) {
    return true;
  }

  if (data.deploy_required === false) {
    const hasUnsafeFields = keys.some((key) => !EXPORT_SAFE_FIELDS.has(key));
    return hasUnsafeFields;
  }

  return keys.some((key) => !EXPORT_SAFE_FIELDS.has(key));
};

const fetchExisting = async (where) => {
  if (!where || typeof where !== 'object' || !where.id) return null;
  const existing = await strapi.entityService.findOne(UID, where.id, {
    publicationState: 'preview',
    fields: ['ui_locale', 'reference_locale', 'status', 'strings', 'notes'],
  });
  return asRecord(existing);
};

const findLocaleByCode = async (localeCode) => {
  const normalized = normalizeLocale(localeCode);
  if (!normalized) return null;

  const entries = await strapi.entityService.findMany(UID, {
    publicationState: 'preview',
    filters: { ui_locale: normalized },
    fields: ['ui_locale', 'reference_locale', 'strings'],
    limit: 1,
  });

  return asRecord(entries?.[0] || null);
};

const resolveReferenceStrings = async ({ localeCode, referenceLocale, data, existing }) => {
  if (localeCode === referenceLocale) {
    const ownStrings = isRecord(data.strings) ? data.strings : existing?.strings;
    return isRecord(ownStrings) ? ownStrings : {};
  }

  const referenceRecord = await findLocaleByCode(referenceLocale);
  if (isRecord(referenceRecord?.strings)) return referenceRecord.strings;

  if (referenceLocale !== DEFAULT_REFERENCE_LOCALE) {
    const fallbackRecord = await findLocaleByCode(DEFAULT_REFERENCE_LOCALE);
    if (isRecord(fallbackRecord?.strings)) return fallbackRecord.strings;
  }

  return {};
};

const enrichUiLocale = async (event, existing = null) => {
  const data = event.params?.data || {};

  const localeCode = normalizeLocale(data.ui_locale || existing?.ui_locale);
  if (localeCode) {
    data.ui_locale = localeCode;
  }

  const referenceLocale = normalizeLocale(data.reference_locale || existing?.reference_locale || DEFAULT_REFERENCE_LOCALE);
  data.reference_locale = referenceLocale || DEFAULT_REFERENCE_LOCALE;

  const localeStrings = isRecord(data.strings) ? data.strings : existing?.strings || {};
  const referenceStrings = await resolveReferenceStrings({
    localeCode: data.ui_locale || '',
    referenceLocale: data.reference_locale,
    data,
    existing,
  });

  const rawStats = computeTranslationStats(referenceStrings, localeStrings);
  const stats = normalizeReferenceStats(rawStats, data.ui_locale === data.reference_locale);
  applyStatsToData(data, stats);

  if (shouldMarkDeployRequired(data)) {
    data.deploy_required = true;
  } else if (hasOwn(data, 'deploy_required')) {
    data.deploy_required = Boolean(data.deploy_required);
  }

  event.params.data = data;
};

module.exports = {
  async beforeCreate(event) {
    await enrichUiLocale(event, null);
  },

  async beforeUpdate(event) {
    const existing = await fetchExisting(event.params?.where);
    await enrichUiLocale(event, existing);
  },
};
