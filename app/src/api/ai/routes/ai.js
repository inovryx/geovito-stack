'use strict';

const diagnosticsRoutes = require('../../../modules/ai/routes/ai-diagnostics');
const draftRoutes = require('../../../modules/ai/routes/ai-draft');

module.exports = {
  routes: [...diagnosticsRoutes, ...draftRoutes],
};
