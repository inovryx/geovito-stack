'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::user-saved-list.user-saved-list');
