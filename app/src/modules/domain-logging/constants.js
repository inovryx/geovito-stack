'use strict';

const DOMAINS = Object.freeze([
  'atlas',
  'blog',
  'ui',
  'search',
  'suggestions',
  'ops',
  'import',
  'ai',
]);

const LEVELS = Object.freeze(['DEBUG', 'INFO', 'WARN', 'ERROR']);
const CHANNELS = Object.freeze(['app', 'security', 'moderation', 'audit', 'release', 'dr']);

const DEFAULT_DOMAIN = 'ui';
const DEFAULT_LEVEL = 'INFO';
const DEFAULT_CHANNEL = 'app';

module.exports = {
  DOMAINS,
  LEVELS,
  CHANNELS,
  DEFAULT_DOMAIN,
  DEFAULT_LEVEL,
  DEFAULT_CHANNEL,
};
