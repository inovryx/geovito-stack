'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/user-follows/me/toggle',
      handler: 'user-follow.toggleMe',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/user-follows/me/list',
      handler: 'user-follow.myList',
      config: {
        auth: false,
      },
    },
  ],
};
