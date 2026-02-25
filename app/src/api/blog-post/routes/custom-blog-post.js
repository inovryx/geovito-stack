'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/blog-posts/me/draft',
      handler: 'blog-post.createMyDraft',
      config: {
        auth: false,
      },
    },
    {
      method: 'PUT',
      path: '/blog-posts/me/draft/:postId',
      handler: 'blog-post.updateMyDraft',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/blog-posts/me/submit/:postId',
      handler: 'blog-post.submitMyDraft',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/blog-posts/me/list',
      handler: 'blog-post.myList',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/blog-posts/me/visibility/:postId',
      handler: 'blog-post.setMyVisibility',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/blog-posts/moderation/list',
      handler: 'blog-post.moderationList',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/blog-posts/moderation/set',
      handler: 'blog-post.moderationSet',
      config: {
        auth: false,
      },
    },
  ],
};
