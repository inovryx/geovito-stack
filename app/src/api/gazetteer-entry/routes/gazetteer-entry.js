'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::gazetteer-entry.gazetteer-entry', {
  only: ['find', 'findOne'],
});
