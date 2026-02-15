'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/user-preferences/me',
      handler: 'user-preference.getMe',
      config: {},
    },
    {
      method: 'PUT',
      path: '/user-preferences/me',
      handler: 'user-preference.upsertMe',
      config: {},
    },
  ],
};
