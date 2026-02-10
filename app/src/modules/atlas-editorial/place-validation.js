'use strict';

const { DEFAULT_LANGUAGE } = require('../language-state/constants');
const { ATLAS_PLACE_TYPES, NON_COUNTRY_TYPES } = require('./constants');
const {
  normalizeCountryCode,
  resolveCountryProfile,
  isLevelEnabled,
  isParentAllowed,
  resolveAutoRegionKey,
} = require('../country-profiles');

const PLACE_TYPE_SET = new Set(ATLAS_PLACE_TYPES);

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

const isBlank = (value) => typeof value !== 'string' || value.trim().length === 0;

const normalizeSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const normalizeRegionKey = (value) => normalizeSlug(value);

const looksLikeComponentReference = (translations) =>
  Array.isArray(translations) &&
  translations.length > 0 &&
  translations.every((item) => item && typeof item === 'object' && 'id' in item && !('language' in item));

const fetchExisting = async (uid, where) => {
  if (!where || typeof where !== 'object') return null;

  if (where.id) {
    return strapi.entityService.findOne(uid, where.id, {
      publicationState: 'preview',
      populate: ['translations', 'parent', 'country_profile', 'region_groups'],
    });
  }

  if (where.documentId) {
    const existing = await strapi.entityService.findMany(uid, {
      publicationState: 'preview',
      filters: { documentId: where.documentId },
      populate: ['translations', 'parent', 'country_profile', 'region_groups'],
      limit: 1,
    });
    return existing[0] || null;
  }

  return null;
};

const findByPlaceId = async (placeId) => {
  if (isBlank(placeId)) return null;
  const list = await strapi.entityService.findMany('api::atlas-place.atlas-place', {
    publicationState: 'preview',
    filters: { place_id: placeId },
    fields: ['id', 'place_id', 'country_code', 'place_type', 'parent_place_id', 'slug'],
    limit: 1,
  });
  return list[0] || null;
};

const findById = async (id) => {
  if (!id) return null;
  return strapi.entityService.findOne('api::atlas-place.atlas-place', id, {
    publicationState: 'preview',
    fields: ['id', 'place_id', 'country_code', 'place_type', 'parent_place_id', 'slug'],
  });
};

const findRegionGroupByKey = async (regionKey, countryCode) => {
  if (isBlank(regionKey) || isBlank(countryCode)) return null;

  const list = await strapi.entityService.findMany('api::region-group.region-group', {
    publicationState: 'preview',
    filters: {
      region_key: regionKey,
      country_code: countryCode,
    },
    fields: ['id', 'region_key', 'country_code'],
    limit: 1,
  });

  return list[0] || null;
};

const normalizeCoordinate = (value, label) => {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} must be numeric`);
  }
  return numberValue;
};

const toRelationId = (value) => {
  if (!value) return null;

  if (typeof value === 'number') return value;

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === 'object') {
    if (value.id) return Number(value.id);

    if (Array.isArray(value.connect) && value.connect[0]?.id) {
      return Number(value.connect[0].id);
    }

    if (Array.isArray(value.set) && value.set[0]?.id) {
      return Number(value.set[0].id);
    }
  }

  return null;
};

const collectRelationIds = (value) => {
  const output = [];
  const append = (candidate) => {
    const relationId = toRelationId(candidate);
    if (relationId && !output.includes(relationId)) {
      output.push(relationId);
    }
  };

  if (!value) return output;

  if (Array.isArray(value)) {
    value.forEach(append);
    return output;
  }

  if (typeof value === 'object') {
    if (value.id) append(value);
    if (Array.isArray(value.set)) value.set.forEach(append);
    if (Array.isArray(value.connect)) value.connect.forEach(append);
    return output;
  }

  append(value);
  return output;
};

const resolveCanonicalSlug = (data, existing) => {
  const canonicalLanguage = data.canonical_language || existing?.canonical_language || DEFAULT_LANGUAGE;
  const translations = Array.isArray(data.translations) ? data.translations : existing?.translations || [];

  if (!Array.isArray(translations) || translations.length === 0 || looksLikeComponentReference(translations)) {
    return null;
  }

  const translation = translations.find((item) => item?.language === canonicalLanguage) || null;
  if (!translation || translation.status !== 'complete' || isBlank(translation.slug)) {
    return null;
  }

  return normalizeSlug(translation.slug);
};

const assertPlaceType = (value) => {
  if (!PLACE_TYPE_SET.has(value)) {
    throw new Error(`place_type must be one of: ${ATLAS_PLACE_TYPES.join(', ')}`);
  }
};

const resolveParentForWrite = async (data, existing) => {
  if (hasOwn(data, 'parent_place_id') && isBlank(data.parent_place_id)) {
    data.parent_place_id = null;
  }

  if (hasOwn(data, 'parent') && data.parent === null) {
    data.parent_place_id = null;
    return null;
  }

  const explicitParentPlaceId =
    typeof data.parent_place_id === 'string' && data.parent_place_id.trim().length > 0
      ? data.parent_place_id.trim()
      : null;
  const explicitParentId = toRelationId(data.parent);

  if (explicitParentPlaceId) {
    const parentEntry = await findByPlaceId(explicitParentPlaceId);
    if (!parentEntry) {
      throw new Error(`parent_place_id (${explicitParentPlaceId}) does not match any atlas-place`);
    }
    data.parent = parentEntry.id;
    data.parent_place_id = parentEntry.place_id;
    return parentEntry;
  }

  if (explicitParentId) {
    const parentEntry = await findById(explicitParentId);
    if (!parentEntry) {
      throw new Error(`parent relation id (${explicitParentId}) does not match any atlas-place`);
    }
    data.parent = parentEntry.id;
    data.parent_place_id = parentEntry.place_id;
    return parentEntry;
  }

  if (existing?.parent?.id) {
    const existingParent = await findById(existing.parent.id);
    if (existingParent) {
      data.parent_place_id = data.parent_place_id || existingParent.place_id;
      return existingParent;
    }
  }

  if (existing?.parent_place_id && !data.parent_place_id) {
    data.parent_place_id = existing.parent_place_id;
  }

  return null;
};

const resolveCountryProfileForWrite = async (data, existing) => {
  const explicitProfileId = toRelationId(data.country_profile);
  const existingProfileId = existing?.country_profile?.id || null;
  const profileId = explicitProfileId || existingProfileId || null;

  const normalizedCountryCode = normalizeCountryCode(data.country_code || existing?.country_code || '');
  if (!/^[A-Z]{2}$/.test(normalizedCountryCode)) {
    throw new Error('country_code must be a two-letter uppercase code');
  }

  const profile = await resolveCountryProfile({
    countryCode: normalizedCountryCode,
    profileId,
  });

  if (profile?.country_code && profile.country_code !== normalizedCountryCode) {
    throw new Error(
      `country_profile (${profile.id || 'default'}) is for ${profile.country_code}, but place country_code is ${normalizedCountryCode}`
    );
  }

  if (profile?.id) {
    data.country_profile = profile.id;
  }

  return profile;
};

const levelLabel = (profile, placeType) => {
  const mapping = profile?.label_mapping || profile?.level_labels || {};
  return String(mapping[placeType] || placeType || 'unknown').trim();
};

const enforceHierarchyRules = (data, existing, parentEntry, profile) => {
  const placeType = data.place_type || existing?.place_type;
  if (!placeType) return null;
  assertPlaceType(placeType);

  if (!isLevelEnabled(profile, placeType)) {
    throw new Error(
      `${levelLabel(profile, placeType)} (${placeType}) is disabled for country ${
        profile?.country_code || data.country_code || existing?.country_code
      }`
    );
  }

  const effectivePlaceId = data.place_id || existing?.place_id;
  const effectiveParentPlaceId = data.parent_place_id || parentEntry?.place_id || existing?.parent_place_id || null;
  const effectiveParentPlaceType = parentEntry?.place_type || existing?.parent?.place_type || null;

  if (effectivePlaceId && effectiveParentPlaceId && effectivePlaceId === effectiveParentPlaceId) {
    throw new Error('A place cannot be its own parent');
  }

  if (placeType === 'country') {
    if (effectiveParentPlaceId) {
      throw new Error('country place_type cannot have a parent');
    }
    data.parent = null;
    data.parent_place_id = null;
    return placeType;
  }

  if (NON_COUNTRY_TYPES.has(placeType) && !effectiveParentPlaceId) {
    throw new Error(`${levelLabel(profile, placeType)} (${placeType}) requires parent_place_id (or parent relation)`);
  }

  if (!isParentAllowed(profile, placeType, effectiveParentPlaceType)) {
    throw new Error(
      `${levelLabel(profile, placeType)} (${placeType}) cannot be attached to parent ${
        levelLabel(profile, effectiveParentPlaceType)
      } (${effectiveParentPlaceType || 'unknown'}) for ${profile?.country_code || data.country_code || existing?.country_code}`
    );
  }

  return placeType;
};

const enforceCountryConsistency = (data, existing, parentEntry) => {
  const countryCode = data.country_code || existing?.country_code;
  if (!countryCode) return;

  const normalized = normalizeCountryCode(countryCode);
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new Error('country_code must be a two-letter uppercase code');
  }

  data.country_code = normalized;

  if (parentEntry?.country_code && parentEntry.country_code !== normalized) {
    throw new Error(
      `country_code mismatch: parent country_code is ${parentEntry.country_code}, received ${normalized}`
    );
  }
};

const enforceCoordinates = (data) => {
  const lat = normalizeCoordinate(data.lat ?? data.latitude, 'lat');
  const lng = normalizeCoordinate(data.lng ?? data.longitude, 'lng');

  if (lat !== null) {
    data.lat = lat;
    data.latitude = lat;
  }

  if (lng !== null) {
    data.lng = lng;
    data.longitude = lng;
  }
};

const resolveAdmin1Context = async (data, existing, parentEntry, placeType) => {
  if (placeType === 'admin1') {
    return {
      admin1PlaceId: String(data.place_id || existing?.place_id || '').trim(),
      admin1Slug: normalizeSlug(data.slug || existing?.slug || ''),
    };
  }

  let cursor = parentEntry || null;
  const visited = new Set();

  for (let depth = 0; cursor && depth < 24; depth += 1) {
    if (cursor.place_type === 'admin1') {
      return {
        admin1PlaceId: String(cursor.place_id || '').trim(),
        admin1Slug: normalizeSlug(cursor.slug || ''),
      };
    }

    const nextParentPlaceId = cursor.parent_place_id || null;
    if (!nextParentPlaceId || visited.has(nextParentPlaceId)) {
      break;
    }

    visited.add(nextParentPlaceId);
    cursor = await findByPlaceId(nextParentPlaceId);
  }

  return {
    admin1PlaceId: '',
    admin1Slug: '',
  };
};

const enforceNoCycle = async (data, existing, parentEntry) => {
  if (!parentEntry) return;

  const effectivePlaceId = String(data.place_id || existing?.place_id || '').trim();
  const effectiveEntityId = existing?.id ? Number(existing.id) : null;

  let cursor = parentEntry;
  const visited = new Set();

  for (let depth = 0; cursor && depth < 64; depth += 1) {
    if (effectiveEntityId && Number(cursor.id) === effectiveEntityId) {
      throw new Error('Parent cycle detected: selected parent resolves to the same record');
    }

    if (effectivePlaceId && cursor.place_id === effectivePlaceId) {
      throw new Error('Parent cycle detected: selected parent resolves to the same place_id chain');
    }

    const cursorPlaceId = String(cursor.place_id || '').trim();
    if (cursorPlaceId) {
      if (visited.has(cursorPlaceId)) {
        throw new Error('Parent hierarchy contains an existing cycle; please repair parent links first');
      }
      visited.add(cursorPlaceId);
    }

    const nextParentPlaceId = cursor.parent_place_id || null;
    if (!nextParentPlaceId) {
      return;
    }

    cursor = await findByPlaceId(nextParentPlaceId);
  }

  if (cursor) {
    throw new Error('Parent hierarchy is too deep or cyclic; validation aborted');
  }
};

const resolveEffectiveRegionKey = async (data, existing, profile, parentEntry, placeType) => {
  let overrideRegion = '';

  if (hasOwn(data, 'region_override')) {
    overrideRegion = normalizeRegionKey(data.region_override);
    data.region_override = overrideRegion || null;
  } else {
    overrideRegion = normalizeRegionKey(existing?.region_override || '');
  }

  if (overrideRegion) {
    return overrideRegion;
  }

  if (placeType === 'country') {
    return '';
  }

  const admin1Context = await resolveAdmin1Context(data, existing, parentEntry, placeType);
  const autoRegionKey = resolveAutoRegionKey(profile, data, existing, admin1Context);
  return normalizeRegionKey(autoRegionKey);
};

const applyEffectiveRegionAssignment = async (data, existing, profile, parentEntry, placeType) => {
  const effectiveRegion = await resolveEffectiveRegionKey(data, existing, profile, parentEntry, placeType);

  data.region = effectiveRegion || null;

  if (!effectiveRegion) {
    return;
  }

  const countryCode = normalizeCountryCode(data.country_code || existing?.country_code || profile?.country_code || '');
  if (!countryCode) {
    return;
  }

  const regionGroup = await findRegionGroupByKey(effectiveRegion, countryCode);
  if (!regionGroup) {
    throw new Error(
      `effective region '${effectiveRegion}' is missing in region_group for country ${countryCode}. Create region_group first.`
    );
  }

  const existingRegionGroupIds = Array.isArray(existing?.region_groups)
    ? existing.region_groups.map((entry) => toRelationId(entry)).filter(Boolean)
    : [];
  const incomingRegionGroupIds = collectRelationIds(data.region_groups);

  const nextRegionGroupIds = Array.from(new Set([...existingRegionGroupIds, ...incomingRegionGroupIds, regionGroup.id]));
  data.region_groups = {
    set: nextRegionGroupIds.map((id) => ({ id })),
  };
};

const enforceImmutableIdentity = (data, existing) => {
  if (!existing) return;

  if (data.place_id && existing.place_id && data.place_id !== existing.place_id) {
    throw new Error(`place_id is immutable (${existing.place_id})`);
  }

  const incomingSlug = typeof data.slug === 'string' ? normalizeSlug(data.slug) : null;
  if (incomingSlug) {
    data.slug = incomingSlug;
  }

  const derivedCanonicalSlug = resolveCanonicalSlug(data, existing);
  const nextSlug = incomingSlug || derivedCanonicalSlug || existing.slug || null;

  if (existing.slug && nextSlug && existing.slug !== nextSlug) {
    throw new Error(
      `slug is immutable once set (${existing.slug}). Create redirect strategy before slug mutation.`
    );
  }

  if (!existing.slug && nextSlug && !data.slug) {
    data.slug = nextSlug;
  }
};

const enforceCanonicalSlugOnCreate = (data) => {
  if (typeof data.slug === 'string' && data.slug.trim()) {
    data.slug = normalizeSlug(data.slug);
    return;
  }

  const derivedCanonicalSlug = resolveCanonicalSlug(data, null);
  if (derivedCanonicalSlug) {
    data.slug = derivedCanonicalSlug;
  }
};

const beforeCreate = async (event, uid) => {
  const data = event.params?.data || {};
  const parentEntry = await resolveParentForWrite(data, null);

  enforceCoordinates(data);
  enforceCountryConsistency(data, null, parentEntry);

  const countryProfile = await resolveCountryProfileForWrite(data, null);
  const placeType = enforceHierarchyRules(data, null, parentEntry, countryProfile);
  await enforceNoCycle(data, null, parentEntry);
  await applyEffectiveRegionAssignment(data, null, countryProfile, parentEntry, placeType);

  enforceCanonicalSlugOnCreate(data);

  event.params.data = data;
};

const beforeUpdate = async (event, uid) => {
  const data = event.params?.data || {};
  const existing = await fetchExisting(uid, event.params?.where);

  const parentEntry = await resolveParentForWrite(data, existing);
  enforceCoordinates(data);
  enforceCountryConsistency(data, existing, parentEntry);

  const countryProfile = await resolveCountryProfileForWrite(data, existing);
  const placeType = enforceHierarchyRules(data, existing, parentEntry, countryProfile);
  await enforceNoCycle(data, existing, parentEntry);
  await applyEffectiveRegionAssignment(data, existing, countryProfile, parentEntry, placeType);

  enforceImmutableIdentity(data, existing);

  event.params.data = data;
};

module.exports = {
  beforeCreate,
  beforeUpdate,
};
