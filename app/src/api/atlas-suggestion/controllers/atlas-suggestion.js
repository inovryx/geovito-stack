'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { normalizePublicSuggestionPayload } = require('../../../modules/suggestions/public-payload');
const { getClientIp, isLimited } = require('../../../modules/suggestions/rate-limit');
const { log } = require('../../../modules/domain-logging');
const { resolveActor } = require('../../../modules/domain-logging/context');

module.exports = createCoreController('api::atlas-suggestion.atlas-suggestion', ({ strapi }) => ({
  async submit(ctx) {
    const clientIp = getClientIp(ctx);
    const requestId = ctx.state?.requestId || null;
    const actor = resolveActor(ctx);

    if (isLimited(clientIp)) {
      const message = 'Too many suggestion submissions. Please try later.';
      await log(
        'suggestions',
        'WARN',
        'suggestion.submit.rate_limited',
        message,
        {
          path: ctx.path,
          method: ctx.method,
          ip: clientIp,
        },
        {
          request_id: requestId,
          actor,
        }
      );

      if (typeof ctx.tooManyRequests === 'function') {
        return ctx.tooManyRequests(message);
      }

      ctx.status = 429;
      ctx.body = {
        ok: false,
        error: message,
      };
      return;
    }

    const payload = normalizePublicSuggestionPayload(ctx.request.body || {});

    const entry = await strapi
      .service('api::atlas-suggestion.atlas-suggestion')
      .createFromPublicSubmission(payload, {
        clientIp,
        authenticatedUserId: ctx.state?.user?.id || null,
      });

    ctx.status = 201;
    ctx.body = {
      ok: true,
      status: 'received',
      suggestion_ref: entry.suggestion_id,
    };

    await log(
      'suggestions',
      'INFO',
      'suggestion.submit.created',
      'Atlas suggestion submitted',
      {
        suggestion_type: payload.suggestion_type,
        language: payload.language,
        target_place_ref: payload.target_place_ref || null,
      },
      {
        request_id: requestId,
        actor,
        entity_ref: entry.suggestion_id,
      }
    );
  },
}));
