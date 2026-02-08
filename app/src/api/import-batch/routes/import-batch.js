'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::import-batch.import-batch', {
  only: ['find', 'findOne'],
});
