'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/community-settings/effective',
      handler: 'community-setting.effective',
      config: {
        auth: false,
      },
    },
    {
      method: 'PATCH',
      path: '/community-settings/effective',
      handler: 'community-setting.updateEffective',
      config: {
        auth: false,
      },
    },
  ],
};
