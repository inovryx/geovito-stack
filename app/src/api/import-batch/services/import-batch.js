'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::import-batch.import-batch');
