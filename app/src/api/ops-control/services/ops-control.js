'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::ops-control.ops-control');
