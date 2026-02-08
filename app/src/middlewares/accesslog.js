'use strict';

const { log, shouldEmitLevel } = require('../modules/domain-logging');
const {
  resolveActor,
  resolveDomainFromPath,
  resolveEntityRef,
  getClientIp,
} = require('../modules/domain-logging/context');

module.exports = () => {
  return async (ctx, next) => {
    const startedAt = Date.now();
    const requestId = ctx.state.requestId || null;
    const domain = resolveDomainFromPath(ctx.path);
    const actor = resolveActor(ctx);
    const entityRef = resolveEntityRef(ctx);

    try {
      await next();
    } finally {
      const durationMs = Date.now() - startedAt;
      const level = ctx.status >= 500 ? 'ERROR' : ctx.status >= 400 ? 'WARN' : 'INFO';
      const payload = {
        service: 'strapi',
        env: process.env.NODE_ENV || 'development',
        method: ctx.method,
        path: ctx.path,
        query: ctx.querystring || '',
        status: ctx.status,
        duration_ms: durationMs,
        ip: getClientIp(ctx),
      };

      await log(
        domain,
        level,
        'http.request.completed',
        `${ctx.method} ${ctx.path} -> ${ctx.status} (${durationMs}ms)`,
        payload,
        {
          request_id: requestId,
          actor,
          entity_ref: entityRef,
        }
      );

      if (shouldEmitLevel(level)) {
        const strapiLevel = level.toLowerCase();
        strapi.log[strapiLevel](JSON.stringify({ ...payload, request_id: requestId, domain }));
      }
    }
  };
};
