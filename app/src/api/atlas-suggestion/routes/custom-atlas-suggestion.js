'use strict';

module.exports = {
  routes: [
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
