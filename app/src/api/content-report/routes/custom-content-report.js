'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/content-reports/submit',
      handler: 'content-report.submit',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/content-reports/moderation/list',
      handler: 'content-report.moderationList',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/content-reports/moderation/set',
      handler: 'content-report.moderationSet',
      config: {
        auth: false,
      },
    },
  ],
};

