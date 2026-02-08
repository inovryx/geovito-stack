'use strict';

const { errors } = require('@strapi/utils');
const {
  SUGGESTION_STATUS,
} = require('../../../../modules/suggestions/constants');
const {
  assertAllowedTransition,
  moderationMetadata,
  requireModerationNotes,
} = require('../../../../modules/suggestions/state-machine');
const { log } = require('../../../../modules/domain-logging');

const fetchExisting = async (where) => {
  if (!where || typeof where !== 'object') return null;

  if (where.id) {
    return strapi.entityService.findOne('api::atlas-suggestion.atlas-suggestion', where.id, {
      publicationState: 'preview',
    });
  }

  if (where.documentId) {
    const existing = await strapi.entityService.findMany('api::atlas-suggestion.atlas-suggestion', {
      publicationState: 'preview',
      filters: { documentId: where.documentId },
      limit: 1,
    });

    return existing[0] || null;
  }

  return null;
};

const getAdminUserFromRequestContext = () => {
  try {
    const ctx = strapi.requestContext.get();
    return ctx?.state?.user || null;
  } catch {
    return null;
  }
};

const getRequestMetadata = () => {
  try {
    const ctx = strapi.requestContext.get();
    return {
      requestId: ctx?.state?.requestId || null,
      actor: ctx?.state?.user?.id ? 'admin' : 'system',
    };
  } catch {
    return {
      requestId: null,
      actor: 'system',
    };
  }
};

module.exports = {
  beforeCreate(event) {
    const data = event.params?.data || {};

    if (data.status && data.status !== SUGGESTION_STATUS.NEW) {
      throw new errors.ValidationError('Suggestions must be created with status=new');
    }

    data.status = SUGGESTION_STATUS.NEW;
    event.params.data = data;
  },

  async beforeUpdate(event) {
    const data = event.params?.data || {};
    const existing = await fetchExisting(event.params?.where);

    if (!existing) return;

    const currentStatus = existing.status;
    const nextStatus = data.status || currentStatus;

    assertAllowedTransition(currentStatus, nextStatus);

    if (nextStatus !== currentStatus) {
      const nextNotes =
        typeof data.moderation_notes === 'string' ? data.moderation_notes : existing.moderation_notes;

      requireModerationNotes(nextNotes, nextStatus);

      if (nextStatus === SUGGESTION_STATUS.ACCEPTED || nextStatus === SUGGESTION_STATUS.REJECTED) {
        Object.assign(data, moderationMetadata(getAdminUserFromRequestContext()));
      }

      const requestMeta = getRequestMetadata();
      await log(
        'suggestions',
        'INFO',
        'suggestion.status.transition',
        `Suggestion status updated: ${currentStatus} -> ${nextStatus}`,
        {
          from: currentStatus,
          to: nextStatus,
        },
        {
          request_id: requestMeta.requestId,
          actor: requestMeta.actor,
          entity_ref: existing.suggestion_id || null,
        }
      );
    }

    event.params.data = data;
  },
};
