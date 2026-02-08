'use strict';

const { DEFAULT_LANGUAGE } = require('../language-state/constants');
const { ATLAS_PLACE_TYPES, NON_COUNTRY_TYPES } = require('./constants');

const PLACE_TYPE_SET = new Set(ATLAS_PLACE_TYPES);

const isBlank = (value) => typeof value !== 'string' || value.trim().length === 0;

const normalizeSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const looksLikeComponentReference = (translations) =>
  Array.isArray(translations) &&
  translations.length > 0 &&
  translations.every((item) => item && typeof item === 'object' && 'id' in item && !('language' in item));

const fetchExisting = async (uid, where) => {
  if (!where || typeof where !== 'object') return null;

  if (where.id) {
    return strapi.entityService.findOne(uid, where.id, {
      publicationState: 'preview',
      populate: ['translations', 'parent'],
    });
  }

  if (where.documentId) {
    const existing = await strapi.entityService.findMany(uid, {
      publicationState: 'preview',
      filters: { documentId: where.documentId },
      populate: ['translations', 'parent'],
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
    fields: ['id', 'place_id', 'country_code'],
    limit: 1,
  });
  return list[0] || null;
};

const findById = async (id) => {
  if (!id) return null;
  return strapi.entityService.findOne('api::atlas-place.atlas-place', id, {
    publicationState: 'preview',
    fields: ['id', 'place_id', 'country_code'],
  });
};

const normalizeCountryCode = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new Error('country_code must be a two-letter uppercase code');
  }
  return normalized;
};

const normalizeCoordinate = (value, label) => {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} must be numeric`);
  }
  return numberValue;
};

const toParentId = (parentValue) => {
  if (!parentValue) return null;
  if (typeof parentValue === 'number') return parentValue;
  if (typeof parentValue === 'string' && parentValue.trim()) return Number(parentValue);
  if (typeof parentValue === 'object' && parentValue.id) return Number(parentValue.id);
  return null;
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
  const explicitParentPlaceId =
    typeof data.parent_place_id === 'string' && data.parent_place_id.trim().length > 0
      ? data.parent_place_id.trim()
      : null;
  const explicitParentId = toParentId(data.parent);

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

const enforceHierarchyRules = (data, existing, parentEntry) => {
  const placeType = data.place_type || existing?.place_type;
  if (!placeType) return;
  assertPlaceType(placeType);

  const effectivePlaceId = data.place_id || existing?.place_id;
  const effectiveParentPlaceId = data.parent_place_id || parentEntry?.place_id || existing?.parent_place_id || null;

  if (effectivePlaceId && effectiveParentPlaceId && effectivePlaceId === effectiveParentPlaceId) {
    throw new Error('A place cannot be its own parent');
  }

  if (placeType === 'country') {
    if (effectiveParentPlaceId) {
      throw new Error('country place_type cannot have a parent');
    }
    data.parent = null;
    data.parent_place_id = null;
    return;
  }

  if (NON_COUNTRY_TYPES.has(placeType) && !effectiveParentPlaceId) {
    throw new Error(`${placeType} requires parent_place_id (or parent relation)`);
  }
};

const enforceCountryConsistency = (data, existing, parentEntry) => {
  const countryCode = data.country_code || existing?.country_code;
  if (!countryCode) return;

  const normalized = normalizeCountryCode(countryCode);
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
  enforceHierarchyRules(data, null, parentEntry);
  enforceCanonicalSlugOnCreate(data);

  event.params.data = data;
};

const beforeUpdate = async (event, uid) => {
  const data = event.params?.data || {};
  const existing = await fetchExisting(uid, event.params?.where);

  const parentEntry = await resolveParentForWrite(data, existing);
  enforceCoordinates(data);
  enforceCountryConsistency(data, existing, parentEntry);
  enforceHierarchyRules(data, existing, parentEntry);
  enforceImmutableIdentity(data, existing);

  event.params.data = data;
};

module.exports = {
  beforeCreate,
  beforeUpdate,
};
