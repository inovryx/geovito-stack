'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::blog-post-revision.blog-post-revision');

