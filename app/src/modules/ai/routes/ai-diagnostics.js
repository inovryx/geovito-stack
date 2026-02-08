'use strict';

module.exports = [
  {
    method: 'POST',
    path: '/ai/diagnostics',
    handler: 'ai.diagnostics',
    config: {
      auth: false,
      policies: ['global::ai-access'],
    },
  },
];
