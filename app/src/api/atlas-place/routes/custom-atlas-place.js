'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/atlas-places/:placeId/editorial-checklist',
      handler: 'atlas-place.editorialChecklist',
      config: {
        auth: false,
      },
    },
  ],
};
