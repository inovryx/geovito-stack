'use strict';

const MAX_EXAMPLE_KEYS = 25;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const flattenObject = (input, prefix = '', out = {}) => {
  if (!isPlainObject(input)) return out;

  for (const [key, value] of Object.entries(input)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(value)) {
      flattenObject(value, fullKey, out);
      continue;
    }

    out[fullKey] = value;
  }

  return out;
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const normalizeComparable = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  return String(value);
};

const computeTranslationStats = (referenceStrings, localeStrings) => {
  const referenceFlat = flattenObject(referenceStrings || {});
  const localeFlat = flattenObject(localeStrings || {});
  const referenceKeys = Object.keys(referenceFlat).sort((left, right) => left.localeCompare(right));

  const missing = [];
  const untranslated = [];
  const translated = [];

  for (const key of referenceKeys) {
    const hasTarget = hasOwn(localeFlat, key);
    if (!hasTarget) {
      missing.push(key);
      continue;
    }

    const localeValue = localeFlat[key];
    if (localeValue === null || localeValue === undefined || (typeof localeValue === 'string' && localeValue.trim() === '')) {
      missing.push(key);
      continue;
    }

    const normalizedRef = normalizeComparable(referenceFlat[key]);
    const normalizedLocale = normalizeComparable(localeValue);
    if (normalizedRef === normalizedLocale) {
      untranslated.push(key);
    } else {
      translated.push(key);
    }
  }

  const total = referenceKeys.length;
  const translatedCount = translated.length;
  const coverage = total > 0 ? Number(((translatedCount / total) * 100).toFixed(2)) : 100;

  return {
    reference_keys: referenceKeys,
    total_keys: total,
    translated_keys: translatedCount,
    missing_keys: missing.length,
    untranslated_keys: untranslated.length,
    coverage_percent: coverage,
    missing_examples: missing.slice(0, MAX_EXAMPLE_KEYS),
    untranslated_examples: untranslated.slice(0, MAX_EXAMPLE_KEYS),
    flat_reference: referenceFlat,
    flat_locale: localeFlat,
  };
};

const buildReferenceRows = (referenceStrings, localeStrings, options = {}) => {
  const stats = computeTranslationStats(referenceStrings, localeStrings);
  const stateFilter = String(options.state || 'all').trim().toLowerCase();
  const allowedState = new Set(['all', 'missing', 'untranslated', 'translated']);
  const effectiveStateFilter = allowedState.has(stateFilter) ? stateFilter : 'all';

  const rows = [];
  for (const key of stats.reference_keys) {
    const refValue = stats.flat_reference[key];
    const localeHasKey = hasOwn(stats.flat_locale, key);
    const localeValue = localeHasKey ? stats.flat_locale[key] : null;

    let state = 'translated';
    if (!localeHasKey || localeValue === null || localeValue === undefined || (typeof localeValue === 'string' && localeValue.trim() === '')) {
      state = 'missing';
    } else if (normalizeComparable(refValue) === normalizeComparable(localeValue)) {
      state = 'untranslated';
    }

    if (effectiveStateFilter !== 'all' && state !== effectiveStateFilter) {
      continue;
    }

    rows.push({
      key,
      reference_value: refValue,
      locale_value: localeHasKey ? localeValue : null,
      state,
    });
  }

  return {
    stats,
    rows,
  };
};

module.exports = {
  flattenObject,
  computeTranslationStats,
  buildReferenceRows,
};
