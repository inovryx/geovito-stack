'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/blog-comments/submit',
      handler: 'blog-comment.submit',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/blog-comments/count/:postId',
      handler: 'blog-comment.countForPost',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/blog-comments/me/list',
      handler: 'blog-comment.myComments',
      config: {
        auth: false,
      },
    },
  ],
};
