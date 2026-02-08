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

const DEFAULT_DOMAIN = 'ui';
const DEFAULT_LEVEL = 'INFO';

module.exports = {
  DOMAINS,
  LEVELS,
  DEFAULT_DOMAIN,
  DEFAULT_LEVEL,
};
