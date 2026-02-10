'use strict';

const { normalizeCountryCode, normalizePlaceType, getDefaultProfile } = require('../../../../modules/country-profiles');
const { ATLAS_PLACE_TYPES } = require('../../../../modules/atlas-editorial/constants');

const PLACE_TYPE_SET = new Set(ATLAS_PLACE_TYPES);

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

const normalizeLevelList = (value) => {
  const rawLevels = Array.isArray(value) ? value : [];
  const levels = [];

  for (const level of rawLevels) {
    const normalized = normalizePlaceType(level);
    if (!PLACE_TYPE_SET.has(normalized)) {
      throw new Error(`enabled_levels contains invalid place type: ${String(level)}`);
    }
    if (!levels.includes(normalized)) {
      levels.push(normalized);
    }
  }

  if (!levels.length) {
    throw new Error('enabled_levels must contain at least one valid place type');
  }

  if (!levels.includes('country')) {
    levels.unshift('country');
  }

  return levels;
};

const normalizeCityLikeLevels = (value, enabledLevels) => {
  const rawLevels = Array.isArray(value) ? value : [];
  const levels = [];

  for (const level of rawLevels) {
    const normalized = normalizePlaceType(level);
    if (!PLACE_TYPE_SET.has(normalized)) {
      throw new Error(`city_like_levels contains invalid place type: ${String(level)}`);
    }
    if (!enabledLevels.includes(normalized)) {
      throw new Error(`city_like_levels.${normalized} must also exist in enabled_levels`);
    }
    if (!levels.includes(normalized)) {
      levels.push(normalized);
    }
  }

  return levels;
};

const normalizeRuleMap = (value, fieldName) => {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)) {
    throw new Error(`${fieldName} must be an object map`);
  }

  const output = {};

  for (const [rawKey, rawParents] of Object.entries(value)) {
    const child = normalizePlaceType(rawKey);
    if (!PLACE_TYPE_SET.has(child)) {
      throw new Error(`${fieldName}.${rawKey} is not a valid place type`);
    }

    if (!Array.isArray(rawParents)) {
      throw new Error(`${fieldName}.${rawKey} must be an array of place types`);
    }

    const parents = [];
    for (const rawParent of rawParents) {
      const parent = normalizePlaceType(rawParent);
      if (!PLACE_TYPE_SET.has(parent)) {
        throw new Error(`${fieldName}.${rawKey} contains invalid parent type: ${String(rawParent)}`);
      }
      if (!parents.includes(parent)) {
        parents.push(parent);
      }
    }

    output[child] = parents;
  }

  return output;
};

const normalizeLabelMap = (value, fieldName) => {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)) {
    throw new Error(`${fieldName} must be an object map`);
  }

  const output = {};

  for (const [rawKey, rawLabel] of Object.entries(value)) {
    const key = normalizePlaceType(rawKey);
    if (!PLACE_TYPE_SET.has(key)) {
      throw new Error(`${fieldName}.${rawKey} is not a valid place type`);
    }

    const label = String(rawLabel || '').trim();
    if (!label) continue;
    output[key] = label;
  }

  return output;
};

const normalizeAutoAssign = (value) => {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)) {
    throw new Error('region_auto_assign must be an object');
  }

  const byPlaceIdSource = isRecord(value.by_place_id) ? value.by_place_id : {};
  const bySlugSource = isRecord(value.by_slug) ? value.by_slug : {};
  const byAdmin1PlaceIdSource = isRecord(value.by_admin1_place_id) ? value.by_admin1_place_id : {};
  const byAdmin1SlugSource = isRecord(value.by_admin1_slug) ? value.by_admin1_slug : {};

  const sanitize = (source, fieldPath) => {
    const output = {};
    for (const [rawKey, rawTarget] of Object.entries(source)) {
      const key = String(rawKey || '').trim();
      const target = String(rawTarget || '').trim();
      if (!key || !target) {
        throw new Error(`${fieldPath} entries must include non-empty key and region key`);
      }
      output[key] = target;
    }
    return output;
  };

  return {
    by_place_id: sanitize(byPlaceIdSource, 'region_auto_assign.by_place_id'),
    by_slug: sanitize(bySlugSource, 'region_auto_assign.by_slug'),
    by_admin1_place_id: sanitize(byAdmin1PlaceIdSource, 'region_auto_assign.by_admin1_place_id'),
    by_admin1_slug: sanitize(byAdmin1SlugSource, 'region_auto_assign.by_admin1_slug'),
  };
};

const applyNormalization = (event, existing = null) => {
  const data = event.params?.data || {};
  const fallback = getDefaultProfile(data.country_code || existing?.country_code || '');

  const countryCode = normalizeCountryCode(data.country_code || existing?.country_code || fallback.country_code);
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error('country_code must be a two-letter uppercase code');
  }

  data.country_code = countryCode;
  data.enabled_levels = normalizeLevelList(data.enabled_levels || existing?.enabled_levels || fallback.enabled_levels);
  data.parent_rules = normalizeRuleMap(data.parent_rules || existing?.parent_rules || fallback.parent_rules, 'parent_rules');

  const normalizedLabelMapping = normalizeLabelMap(
    data.label_mapping || data.level_labels || existing?.label_mapping || existing?.level_labels || fallback.label_mapping,
    'label_mapping'
  );
  data.label_mapping = normalizedLabelMapping;
  data.level_labels = normalizedLabelMapping;

  data.city_like_levels = normalizeCityLikeLevels(
    data.city_like_levels || existing?.city_like_levels || fallback.city_like_levels,
    data.enabled_levels
  );

  data.region_auto_assign = normalizeAutoAssign(
    data.region_auto_assign || existing?.region_auto_assign || fallback.region_auto_assign
  );

  for (const [childType, parentTypes] of Object.entries(data.parent_rules)) {
    if (!data.enabled_levels.includes(childType)) {
      throw new Error(`parent_rules.${childType} is defined, but ${childType} is not enabled`);
    }

    for (const parentType of parentTypes) {
      if (!data.enabled_levels.includes(parentType)) {
        throw new Error(`parent_rules.${childType} contains parent ${parentType}, but it is not enabled`);
      }
    }
  }

  event.params.data = data;
};

const fetchExisting = async (where) => {
  if (!where || typeof where !== 'object' || !where.id) return null;
  return strapi.entityService.findOne('api::country-profile.country-profile', where.id, {
    publicationState: 'preview',
  });
};

module.exports = {
  beforeCreate(event) {
    applyNormalization(event, null);
  },

  async beforeUpdate(event) {
    const existing = await fetchExisting(event.params?.where);
    applyNormalization(event, existing);
  },
};
