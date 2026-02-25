'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/account-requests/me/submit',
      handler: 'account-request.submitMe',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/account-requests/me/list',
      handler: 'account-request.myList',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/account-requests/moderation/list',
      handler: 'account-request.moderationList',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/account-requests/moderation/set',
      handler: 'account-request.moderationSet',
      config: {
        auth: false,
      },
    }
  ]
};

