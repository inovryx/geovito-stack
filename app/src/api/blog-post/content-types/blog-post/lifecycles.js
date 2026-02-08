'use strict';

const { createLanguageStateLifecycle } = require('../../../../modules/language-state');

module.exports = createLanguageStateLifecycle({
  uid: 'api::blog-post.blog-post',
  contextLabel: 'blog-post',
});
