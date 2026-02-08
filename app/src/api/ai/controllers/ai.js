'use strict';

const { runDiagnostics, runDraft } = require('../../../modules/ai/ai-service');
const { resolveActor } = require('../../../modules/domain-logging/context');

const mapErrorStatus = (error) => {
  if (!error) return 500;
  if (typeof error.status === 'number') return error.status;
  if (typeof error.statusCode === 'number') return error.statusCode;
  const name = String(error.name || '');
  if (name.includes('ValidationError')) return 400;
  if (name.includes('ForbiddenError')) return 403;
  return 500;
};

const renderError = (ctx, error) => {
  const status = mapErrorStatus(error);
  ctx.status = status;
  ctx.body = {
    ok: false,
    error: error?.message || 'AI request failed',
    request_id: ctx.state?.requestId || null,
  };
};

module.exports = {
  async diagnostics(ctx) {
    try {
      const result = await runDiagnostics({
        input: ctx.request.body || {},
        requestId: ctx.state?.requestId || null,
        actor: resolveActor(ctx),
      });

      ctx.status = 200;
      ctx.body = {
        ok: true,
        data: result,
        request_id: ctx.state?.requestId || null,
      };
    } catch (error) {
      renderError(ctx, error);
    }
  },

  async draft(ctx) {
    try {
      const result = await runDraft({
        strapi: global.strapi,
        input: ctx.request.body || {},
        requestId: ctx.state?.requestId || null,
        actor: resolveActor(ctx),
      });

      ctx.status = 200;
      ctx.body = {
        ok: true,
        data: result,
        request_id: ctx.state?.requestId || null,
      };
    } catch (error) {
      renderError(ctx, error);
    }
  },
};
