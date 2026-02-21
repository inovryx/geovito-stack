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
    {
      method: 'GET',
      path: '/blog-comments/moderation/list',
      handler: 'blog-comment.moderationList',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/blog-comments/moderation/set',
      handler: 'blog-comment.moderationSet',
      config: {
        auth: false,
      },
    },
  ],
};
