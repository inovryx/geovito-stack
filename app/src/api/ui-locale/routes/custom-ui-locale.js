'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/ui-locales/meta/progress',
      handler: 'ui-locale.progress',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/ui-locales/meta/:localeKey/reference-preview',
      handler: 'ui-locale.referencePreview',
      config: {},
    },
  ],
};
