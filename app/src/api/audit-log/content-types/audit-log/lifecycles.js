'use strict';

const { errors } = require('@strapi/utils');

module.exports = {
  beforeUpdate() {
    throw new errors.ForbiddenError('audit-log is append-only');
  },

  beforeDelete() {
    throw new errors.ForbiddenError('audit-log is append-only');
  },

  beforeDeleteMany() {
    throw new errors.ForbiddenError('audit-log is append-only');
  },

  beforeUpdateMany() {
    throw new errors.ForbiddenError('audit-log is append-only');
  },
};
