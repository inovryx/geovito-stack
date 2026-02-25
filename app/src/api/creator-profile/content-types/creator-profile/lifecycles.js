'use strict';

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;
const RESERVED_USERNAMES = new Set([
  'admin',
  'support',
  'api',
  'root',
  'geovito',
  'www',
  'help',
  'about',
  'blog',
  'atlas',
  'login',
  'register',
  'dashboard',
  'moderation',
  'settings',
  'u',
]);

const normalizeUsername = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const toOwnerUserId = (value) => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  if (value && typeof value === 'object') {
    const candidate = value.id ?? value.connect?.[0]?.id;
    const parsed = Number(candidate);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
};

const normalizeData = (data = {}) => {
  if (!data || typeof data !== 'object') return;

  const username = normalizeUsername(data.username);
  if (username) {
    data.username = username;
  }

  const ownerUserId = toOwnerUserId(data.owner_user_id) ?? toOwnerUserId(data.owner_user);
  if (ownerUserId) {
    data.owner_user_id = ownerUserId;
  }

  if (data.username && !USERNAME_PATTERN.test(data.username)) {
    throw new Error('creator-profile username must be slug-safe lowercase.');
  }

  if (data.username && RESERVED_USERNAMES.has(data.username)) {
    throw new Error('creator-profile username is reserved.');
  }
};

module.exports = {
  beforeCreate(event) {
    normalizeData(event.params?.data);
  },
  async beforeUpdate(event) {
    normalizeData(event.params?.data);

    const data = event.params?.data || {};
    if (data.username === undefined) return;

    const where = event.params?.where || {};
    const entityId = Number(where.id);
    if (!Number.isInteger(entityId) || entityId <= 0) return;

    const existing = await strapi.entityService.findOne('api::creator-profile.creator-profile', entityId, {
      fields: ['username'],
    });
    const current = normalizeUsername(existing?.username || '');
    const next = normalizeUsername(data.username || '');
    if (current && next && current !== next) {
      throw new Error('creator-profile username is immutable once created.');
    }
  },
};
