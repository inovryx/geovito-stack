'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/ui-pages/meta/progress',
      handler: 'ui-page.progress',
      config: {},
    },
    {
      method: 'GET',
      path: '/ui-pages/meta/:pageKey/reference-preview',
      handler: 'ui-page.referencePreview',
      config: {},
    },
  ],
};
