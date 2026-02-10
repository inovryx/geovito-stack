'use strict';

const { createLanguageStateLifecycle } = require('../../../../modules/language-state');

const UID = 'api::region-group.region-group';

const normalizeCountryCode = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new Error('country_code must be a two-letter uppercase code');
  }
  return normalized;
};

const normalizeRegionKey = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!normalized) {
    throw new Error('region_key is required');
  }

  return normalized;
};

const fetchExisting = async (where) => {
  if (!where || typeof where !== 'object' || !where.id) return null;
  return strapi.entityService.findOne(UID, where.id, {
    publicationState: 'preview',
    populate: ['country_profile'],
  });
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
    if (Array.isArray(value.connect) && value.connect[0]?.id) return Number(value.connect[0].id);
    if (Array.isArray(value.set) && value.set[0]?.id) return Number(value.set[0].id);
  }
  return null;
};

const fetchCountryProfileById = async (id) => {
  if (!id) return null;
  return strapi.entityService.findOne('api::country-profile.country-profile', Number(id), {
    publicationState: 'preview',
    fields: ['id', 'country_code'],
  });
};

const fetchCountryProfileByCode = async (countryCode) => {
  const entries = await strapi.entityService.findMany('api::country-profile.country-profile', {
    publicationState: 'preview',
    filters: { country_code: countryCode },
    fields: ['id', 'country_code'],
    limit: 1,
  });
  return entries[0] || null;
};

const normalizeData = (data, existing) => {
  data.region_key = normalizeRegionKey(data.region_key || existing?.region_key);
  data.country_code = normalizeCountryCode(data.country_code || existing?.country_code);
  return data;
};

const languageLifecycle = createLanguageStateLifecycle({
  uid: UID,
  contextLabel: 'region-group',
});

module.exports = {
  async beforeCreate(event) {
    languageLifecycle.beforeCreate(event);
    const data = event.params?.data || {};
    const normalized = normalizeData(data, null);

    const explicitProfileId = toRelationId(normalized.country_profile);
    const resolvedProfile =
      (explicitProfileId ? await fetchCountryProfileById(explicitProfileId) : null) ||
      (await fetchCountryProfileByCode(normalized.country_code));

    if (resolvedProfile && resolvedProfile.country_code !== normalized.country_code) {
      throw new Error(
        `country_profile (${resolvedProfile.id}) belongs to ${resolvedProfile.country_code}, but region_group country_code is ${normalized.country_code}`
      );
    }

    if (resolvedProfile?.id) {
      normalized.country_profile = resolvedProfile.id;
    }

    event.params.data = normalized;
  },

  async beforeUpdate(event) {
    await languageLifecycle.beforeUpdate(event);
    const existing = await fetchExisting(event.params?.where);
    const data = event.params?.data || {};
    const normalized = normalizeData(data, existing);

    const explicitProfileId = toRelationId(normalized.country_profile);
    const existingProfileId = existing?.country_profile?.id || null;
    const resolvedProfile =
      (explicitProfileId ? await fetchCountryProfileById(explicitProfileId) : null) ||
      (existingProfileId ? await fetchCountryProfileById(existingProfileId) : null) ||
      (await fetchCountryProfileByCode(normalized.country_code));

    if (resolvedProfile && resolvedProfile.country_code !== normalized.country_code) {
      throw new Error(
        `country_profile (${resolvedProfile.id}) belongs to ${resolvedProfile.country_code}, but region_group country_code is ${normalized.country_code}`
      );
    }

    if (resolvedProfile?.id) {
      normalized.country_profile = resolvedProfile.id;
    }

    event.params.data = normalized;
  },
};
