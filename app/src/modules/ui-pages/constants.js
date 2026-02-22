'use strict';

const SYSTEM_PAGE_KEYS = Object.freeze(['about', 'rules', 'help']);
const DEFAULT_REFERENCE_LOCALE = 'en';

const normalizePageKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const isSupportedSystemPageKey = (value) => SYSTEM_PAGE_KEYS.includes(normalizePageKey(value));

const buildSystemPagePath = (language, pageKey) => `/${String(language || '').trim().toLowerCase()}/${normalizePageKey(pageKey)}`;

module.exports = {
  SYSTEM_PAGE_KEYS,
  DEFAULT_REFERENCE_LOCALE,
  normalizePageKey,
  isSupportedSystemPageKey,
  buildSystemPagePath,
};
