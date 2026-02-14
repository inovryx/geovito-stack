'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::ops-control.ops-control');
