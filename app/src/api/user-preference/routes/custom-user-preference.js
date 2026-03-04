'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/user-preferences/me',
      handler: 'user-preference.getMe',
      config: {
        auth: false,
      },
    },
    {
      method: 'PUT',
      path: '/user-preferences/me',
      handler: 'user-preference.upsertMe',
      config: {
        auth: false,
      },
    },
  ],
};
