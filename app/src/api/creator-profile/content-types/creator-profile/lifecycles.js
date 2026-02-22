'use strict';

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;

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
};

module.exports = {
  beforeCreate(event) {
    normalizeData(event.params?.data);
  },
  beforeUpdate(event) {
    normalizeData(event.params?.data);
  },
};
