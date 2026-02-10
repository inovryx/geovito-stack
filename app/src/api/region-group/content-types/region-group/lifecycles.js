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
  });
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
  beforeCreate(event) {
    languageLifecycle.beforeCreate(event);
    const data = event.params?.data || {};
    event.params.data = normalizeData(data, null);
  },

  async beforeUpdate(event) {
    await languageLifecycle.beforeUpdate(event);
    const existing = await fetchExisting(event.params?.where);
    const data = event.params?.data || {};
    event.params.data = normalizeData(data, existing);
  },
};
