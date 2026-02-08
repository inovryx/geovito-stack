'use strict';

module.exports = [
  {
    method: 'POST',
    path: '/ai/draft',
    handler: 'ai.draft',
    config: {
      auth: false,
      policies: ['global::ai-access'],
    },
  },
];
