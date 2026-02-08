'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::atlas-suggestion.atlas-suggestion', {
  only: ['find', 'findOne'],
});
