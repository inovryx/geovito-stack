'use strict';

const { randomUUID } = require('crypto');

module.exports = () => {
  return async (ctx, next) => {
    const incoming = ctx.request.get('x-request-id');
    const requestId = incoming && incoming.trim() ? incoming.trim() : randomUUID();

    ctx.state.requestId = requestId;
    ctx.set('X-Request-ID', requestId);
    ctx.set('x-request-id', requestId);

    await next();
  };
};
