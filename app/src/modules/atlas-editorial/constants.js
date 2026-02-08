'use strict';

const { SUPPORTED_LANGUAGES } = require('../language-state/constants');

const ATLAS_PLACE_TYPES = Object.freeze(['country', 'admin_area', 'city', 'district', 'poi']);

const NON_COUNTRY_TYPES = new Set(['admin_area', 'city', 'district', 'poi']);

const languageSuffix = (language) => String(language || '').trim().toLowerCase().replace(/-/g, '_');

module.exports = {
  SUPPORTED_LANGUAGES,
  ATLAS_PLACE_TYPES,
  NON_COUNTRY_TYPES,
  languageSuffix,
};
