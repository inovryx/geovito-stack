'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/user-saved-lists/me/lists',
      handler: 'user-saved-list.myLists',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/user-saved-lists/me/lists/upsert',
      handler: 'user-saved-list.upsertMeList',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/user-saved-lists/me/items/toggle',
      handler: 'user-saved-list.toggleMeItem',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/user-saved-lists/me/items',
      handler: 'user-saved-list.myItems',
      config: {
        auth: false,
      },
    },
  ],
};
