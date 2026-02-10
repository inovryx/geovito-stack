'use strict';

const { DEFAULT_PROFILE, COUNTRY_DEFAULTS, PLACE_TYPE_SET } = require('./constants');

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

const normalizeCountryCode = (value) => String(value || '').trim().toUpperCase();

const normalizePlaceType = (value) => String(value || '').trim().toLowerCase();

const asEntity = (entry) => {
  if (!entry) return null;
  if (entry.attributes) {
    return {
      id: entry.id,
      ...entry.attributes,
    };
  }
  return entry;
};

const mergeUniqueStringArray = (...lists) => {
  const set = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const normalized = normalizePlaceType(item);
      if (!normalized || !PLACE_TYPE_SET.has(normalized)) continue;
      set.add(normalized);
    }
  }
  return Array.from(set);
};

const mergeRuleMap = (...ruleSources) => {
  const merged = {};

  for (const source of ruleSources) {
    if (!isRecord(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      const normalizedKey = normalizePlaceType(key);
      if (!PLACE_TYPE_SET.has(normalizedKey)) continue;
      const values = mergeUniqueStringArray(value);
      if (values.length) {
        merged[normalizedKey] = values;
      }
    }
  }

  return merged;
};

const mergeLabelMap = (...labelSources) => {
  const merged = {};

  for (const source of labelSources) {
    if (!isRecord(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      const normalizedKey = normalizePlaceType(key);
      if (!PLACE_TYPE_SET.has(normalizedKey)) continue;
      const normalizedValue = String(value || '').trim();
      if (!normalizedValue) continue;
      merged[normalizedKey] = normalizedValue;
    }
  }

  return merged;
};

const mergeCityLikeLevels = (...levelSources) => {
  const merged = [];
  for (const source of levelSources) {
    if (!Array.isArray(source)) continue;
    for (const rawLevel of source) {
      const normalizedLevel = normalizePlaceType(rawLevel);
      if (!PLACE_TYPE_SET.has(normalizedLevel)) continue;
      if (!merged.includes(normalizedLevel)) {
        merged.push(normalizedLevel);
      }
    }
  }
  return merged;
};

const normalizeAutoAssign = (value) => {
  if (!isRecord(value)) return {};

  const byPlaceId = isRecord(value.by_place_id) ? value.by_place_id : {};
  const bySlug = isRecord(value.by_slug) ? value.by_slug : {};
  const byAdmin1PlaceId = isRecord(value.by_admin1_place_id) ? value.by_admin1_place_id : {};
  const byAdmin1Slug = isRecord(value.by_admin1_slug) ? value.by_admin1_slug : {};

  const sanitizeMap = (source) => {
    const output = {};
    for (const [key, rawValue] of Object.entries(source)) {
      const normalizedKey = String(key || '').trim();
      const normalizedValue = String(rawValue || '').trim();
      if (!normalizedKey || !normalizedValue) continue;
      output[normalizedKey] = normalizedValue;
    }
    return output;
  };

  return {
    by_place_id: sanitizeMap(byPlaceId),
    by_slug: sanitizeMap(bySlug),
    by_admin1_place_id: sanitizeMap(byAdmin1PlaceId),
    by_admin1_slug: sanitizeMap(byAdmin1Slug),
  };
};

const normalizeProfileData = (profile, countryCode) => {
  const normalizedCountry = normalizeCountryCode(countryCode || profile?.country_code);
  const defaults = COUNTRY_DEFAULTS[normalizedCountry] || {};

  const enabledLevels = mergeUniqueStringArray(
    DEFAULT_PROFILE.enabled_levels,
    defaults.enabled_levels,
    profile?.enabled_levels
  );

  const parentRules = mergeRuleMap(DEFAULT_PROFILE.parent_rules, defaults.parent_rules, profile?.parent_rules);
  const levelLabels = mergeLabelMap(
    DEFAULT_PROFILE.label_mapping,
    defaults.label_mapping,
    defaults.level_labels,
    profile?.label_mapping,
    profile?.level_labels
  );
  const cityLikeLevels = mergeCityLikeLevels(
    DEFAULT_PROFILE.city_like_levels,
    defaults.city_like_levels,
    profile?.city_like_levels
  );
  const regionAutoAssign = normalizeAutoAssign(profile?.region_auto_assign || defaults.region_auto_assign);

  return {
    id: profile?.id || null,
    country_code: normalizedCountry,
    enabled_levels: enabledLevels,
    parent_rules: parentRules,
    label_mapping: levelLabels,
    level_labels: levelLabels,
    city_like_levels: cityLikeLevels,
    region_auto_assign: regionAutoAssign,
  };
};

const getDefaultProfile = (countryCode) => normalizeProfileData({}, countryCode);

const fetchCountryProfileById = async (profileId) => {
  if (!profileId) return null;
  const entity = await strapi.entityService.findOne('api::country-profile.country-profile', Number(profileId), {
    publicationState: 'preview',
  });
  return asEntity(entity);
};

const fetchCountryProfileByCode = async (countryCode) => {
  if (!countryCode) return null;

  const records = await strapi.entityService.findMany('api::country-profile.country-profile', {
    publicationState: 'preview',
    filters: {
      country_code: normalizeCountryCode(countryCode),
    },
    limit: 1,
  });

  return asEntity(Array.isArray(records) ? records[0] : records);
};

const resolveCountryProfile = async ({ countryCode, profileId }) => {
  const normalizedCountry = normalizeCountryCode(countryCode);

  const explicitProfile = await fetchCountryProfileById(profileId);
  if (explicitProfile) {
    return normalizeProfileData(explicitProfile, normalizedCountry || explicitProfile.country_code);
  }

  const byCodeProfile = await fetchCountryProfileByCode(normalizedCountry);
  if (byCodeProfile) {
    return normalizeProfileData(byCodeProfile, normalizedCountry);
  }

  return getDefaultProfile(normalizedCountry);
};

const isLevelEnabled = (profile, placeType) => {
  const normalized = normalizePlaceType(placeType);
  if (!normalized) return false;
  return Array.isArray(profile?.enabled_levels) && profile.enabled_levels.includes(normalized);
};

const isParentAllowed = (profile, placeType, parentPlaceType) => {
  const child = normalizePlaceType(placeType);
  const parent = normalizePlaceType(parentPlaceType);

  if (!child) return false;
  if (child === 'country') return !parent;
  if (!parent) return false;

  const parentRules = isRecord(profile?.parent_rules) ? profile.parent_rules : {};
  const allowedParents = Array.isArray(parentRules[child]) ? parentRules[child] : [];
  if (allowedParents.length === 0) return true;

  return allowedParents.includes(parent);
};

const resolveAutoRegionKey = (profile, data, existing = null, context = {}) => {
  const placeId = String(data.place_id || existing?.place_id || '').trim();
  const slug = String(data.slug || existing?.slug || '').trim();
  const admin1PlaceId = String(context.admin1PlaceId || '').trim();
  const admin1Slug = String(context.admin1Slug || '').trim();

  const byPlaceId = profile?.region_auto_assign?.by_place_id || {};
  if (placeId && byPlaceId[placeId]) {
    return String(byPlaceId[placeId]).trim();
  }

  const bySlug = profile?.region_auto_assign?.by_slug || {};
  if (slug && bySlug[slug]) {
    return String(bySlug[slug]).trim();
  }

  const byAdmin1PlaceId = profile?.region_auto_assign?.by_admin1_place_id || {};
  if (admin1PlaceId && byAdmin1PlaceId[admin1PlaceId]) {
    return String(byAdmin1PlaceId[admin1PlaceId]).trim();
  }

  const byAdmin1Slug = profile?.region_auto_assign?.by_admin1_slug || {};
  if (admin1Slug && byAdmin1Slug[admin1Slug]) {
    return String(byAdmin1Slug[admin1Slug]).trim();
  }

  return '';
};

const isCityLikeLevel = (profile, placeType) => {
  const normalized = normalizePlaceType(placeType);
  if (!normalized) return false;
  const levels = Array.isArray(profile?.city_like_levels) ? profile.city_like_levels : [];
  return levels.includes(normalized);
};

const getLabelForLevel = (profile, placeType) => {
  const normalized = normalizePlaceType(placeType);
  if (!normalized) return '';
  const mapping = isRecord(profile?.label_mapping) ? profile.label_mapping : {};
  return String(mapping[normalized] || normalized).trim();
};

module.exports = {
  normalizeCountryCode,
  normalizePlaceType,
  resolveCountryProfile,
  isLevelEnabled,
  isParentAllowed,
  resolveAutoRegionKey,
  isCityLikeLevel,
  getLabelForLevel,
  getDefaultProfile,
};
