'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/_health',
      handler: 'atlas-suggestion.health',
      config: {
        auth: false,
        policies: ['global::health-access'],
      },
    },
    {
      method: 'POST',
      path: '/atlas-suggestions/submit',
      handler: 'atlas-suggestion.submit',
      config: {
        auth: false,
      },
    },
  ],
};
