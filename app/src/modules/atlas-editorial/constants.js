'use strict';

const { SUPPORTED_LANGUAGES } = require('../language-state/constants');

const ATLAS_PLACE_TYPES = Object.freeze([
  'country',
  'admin1',
  'admin2',
  'admin3',
  'locality',
  'neighborhood',
  'street',
  'poi',
  // Legacy-compatible aliases kept active to avoid destructive migration.
  'admin_area',
  'city',
  'district',
]);

const NON_COUNTRY_TYPES = new Set(ATLAS_PLACE_TYPES.filter((item) => item !== 'country'));

const languageSuffix = (language) => String(language || '').trim().toLowerCase().replace(/-/g, '_');

module.exports = {
  SUPPORTED_LANGUAGES,
  ATLAS_PLACE_TYPES,
  NON_COUNTRY_TYPES,
  languageSuffix,
};
