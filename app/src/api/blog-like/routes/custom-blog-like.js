'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/blog-likes/toggle',
      handler: 'blog-like.toggle',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/blog-likes/count/:postId',
      handler: 'blog-like.countForPost',
      config: {
        auth: false,
      },
    },
  ],
};
