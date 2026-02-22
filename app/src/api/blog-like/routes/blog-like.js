'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::blog-like.blog-like', {
  only: ['find', 'findOne'],
});
