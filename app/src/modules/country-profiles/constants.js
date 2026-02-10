'use strict';

const { ATLAS_PLACE_TYPES } = require('../atlas-editorial/constants');

const PLACE_TYPE_SET = new Set(ATLAS_PLACE_TYPES);

const DEFAULT_ENABLED_LEVELS = Object.freeze([
  'country',
  'admin1',
  'admin2',
  'admin3',
  'locality',
  'neighborhood',
  'street',
  'poi',
  'admin_area',
  'city',
  'district',
]);

const DEFAULT_PARENT_RULES = Object.freeze({
  country: [],
  admin1: ['country'],
  admin2: ['admin1', 'country'],
  admin3: ['admin2', 'admin1'],
  locality: ['country', 'admin1', 'admin2', 'admin3', 'admin_area'],
  neighborhood: ['locality', 'city', 'admin2', 'admin3', 'district'],
  street: ['neighborhood', 'locality', 'city', 'district'],
  poi: ['street', 'neighborhood', 'district', 'city', 'locality', 'admin3', 'admin2', 'admin_area'],
  admin_area: ['country'],
  city: ['country', 'admin_area', 'admin1', 'admin2'],
  district: ['city', 'locality', 'admin2', 'admin3', 'admin_area'],
});

const DEFAULT_LEVEL_LABELS = Object.freeze({
  country: 'Country',
  admin1: 'Admin Level 1',
  admin2: 'Admin Level 2',
  admin3: 'Admin Level 3',
  locality: 'Locality',
  neighborhood: 'Neighborhood',
  street: 'Street',
  poi: 'Point of Interest',
  admin_area: 'Administrative Area',
  city: 'City',
  district: 'District',
});

const DEFAULT_CITY_LIKE_LEVELS = Object.freeze(['city', 'locality']);

const DEFAULT_PROFILE = Object.freeze({
  enabled_levels: DEFAULT_ENABLED_LEVELS,
  parent_rules: DEFAULT_PARENT_RULES,
  label_mapping: DEFAULT_LEVEL_LABELS,
  level_labels: DEFAULT_LEVEL_LABELS,
  city_like_levels: DEFAULT_CITY_LIKE_LEVELS,
  region_auto_assign: {},
});

const COUNTRY_DEFAULTS = Object.freeze({
  TR: {
    enabled_levels: ['country', 'admin1', 'admin2', 'admin3', 'locality', 'neighborhood', 'street', 'poi', 'city', 'district'],
    label_mapping: {
      admin1: 'Il',
      admin2: 'Ilce',
      admin3: 'Mahalle',
      locality: 'Yerlesim',
      neighborhood: 'Mahalle',
      city: 'Sehir',
      district: 'Ilce',
      poi: 'Nokta',
    },
    city_like_levels: ['city', 'locality', 'admin2'],
    parent_rules: {
      admin1: ['country'],
      admin2: ['admin1', 'city', 'country'],
      admin3: ['admin2', 'district'],
      locality: ['country', 'admin1', 'admin2'],
      neighborhood: ['locality', 'city', 'district', 'admin2'],
      city: ['country', 'admin1'],
      district: ['city', 'admin1', 'admin2'],
      poi: ['district', 'city', 'neighborhood', 'locality', 'admin2', 'admin3'],
    },
    region_auto_assign: {
      by_place_id: {
        'city-tr-antalya': 'tr-mediterranean-region',
        'city-tr-mugla': 'tr-aegean-region',
        'city-tr-istanbul': 'tr-marmara-region',
      },
      by_admin1_slug: {
        antalya: 'tr-mediterranean-region',
        mugla: 'tr-aegean-region',
        istanbul: 'tr-marmara-region',
      },
    },
  },
  US: {
    enabled_levels: ['country', 'admin1', 'admin2', 'locality', 'neighborhood', 'street', 'poi', 'city', 'district'],
    label_mapping: {
      admin1: 'State',
      admin2: 'County',
      locality: 'City',
      neighborhood: 'Neighborhood',
      city: 'City',
      district: 'District',
      poi: 'Point of Interest',
    },
    city_like_levels: ['city', 'locality'],
    parent_rules: {
      admin1: ['country'],
      admin2: ['admin1', 'country'],
      locality: ['admin1', 'admin2', 'country'],
      neighborhood: ['locality', 'city', 'admin2', 'district'],
      city: ['admin1', 'admin2', 'country'],
      district: ['city', 'locality', 'admin2'],
      poi: ['neighborhood', 'district', 'city', 'locality'],
    },
  },
  DE: {
    enabled_levels: ['country', 'admin1', 'admin2', 'locality', 'neighborhood', 'street', 'poi', 'city', 'district'],
    label_mapping: {
      admin1: 'Bundesland',
      admin2: 'Regierungsbezirk',
      locality: 'Stadt',
      neighborhood: 'Bezirk',
      city: 'Stadt',
      district: 'Bezirk',
      poi: 'POI',
    },
    city_like_levels: ['city', 'locality'],
    parent_rules: {
      admin1: ['country'],
      admin2: ['admin1', 'country'],
      locality: ['admin1', 'admin2', 'country'],
      neighborhood: ['locality', 'city', 'district'],
      city: ['admin1', 'admin2', 'country'],
      district: ['city', 'locality', 'admin2'],
      poi: ['district', 'neighborhood', 'city', 'locality'],
    },
  },
});

module.exports = {
  PLACE_TYPE_SET,
  DEFAULT_ENABLED_LEVELS,
  DEFAULT_PARENT_RULES,
  DEFAULT_LEVEL_LABELS,
  DEFAULT_CITY_LIKE_LEVELS,
  DEFAULT_PROFILE,
  COUNTRY_DEFAULTS,
};
