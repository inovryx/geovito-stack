'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/creators',
      handler: 'creator-profile.findPublicList',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/creators/:username',
      handler: 'creator-profile.findPublicByUsername',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/creators/:username/posts',
      handler: 'creator-profile.findPublicPosts',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/creator-profile/me',
      handler: 'creator-profile.me',
      config: {
        auth: false,
      },
    },
    {
      method: 'PUT',
      path: '/creator-profile/me',
      handler: 'creator-profile.upsertMe',
      config: {
        auth: false,
      },
    },
  ],
};
