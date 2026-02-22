'use strict';

const { BLOG_COMMENT_STATUS } = require('../../../../modules/blog-engagement/constants');
const {
  assertAllowedTransition,
  requireModerationNotes,
  moderationMetadata,
  isModeratedStatus,
} = require('../../../../modules/blog-engagement/comment-state-machine');
const { log } = require('../../../../modules/domain-logging');

const UID = 'api::blog-comment.blog-comment';

const fetchExisting = async (where) => {
  if (!where || typeof where !== 'object') return null;

  if (where.id) {
    return strapi.entityService.findOne(UID, where.id, {
      publicationState: 'preview',
      fields: ['id', 'comment_id', 'status', 'moderation_notes', 'reviewed_at', 'reviewed_by'],
    });
  }

  if (where.documentId) {
    const existing = await strapi.entityService.findMany(UID, {
      publicationState: 'preview',
      filters: { documentId: where.documentId },
      fields: ['id', 'comment_id', 'status', 'moderation_notes', 'reviewed_at', 'reviewed_by'],
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
    if (!data.status) {
      data.status = BLOG_COMMENT_STATUS.PENDING;
    }
    event.params.data = data;
  },

  async beforeUpdate(event) {
    const existing = await fetchExisting(event.params?.where);
    if (!existing) return;

    const data = event.params?.data || {};
    const currentStatus = existing.status || BLOG_COMMENT_STATUS.PENDING;
    const nextStatus = data.status || currentStatus;

    assertAllowedTransition(currentStatus, nextStatus);

    if (nextStatus !== currentStatus) {
      const nextNotes =
        typeof data.moderation_notes === 'string' ? data.moderation_notes : existing.moderation_notes;
      requireModerationNotes(nextNotes, nextStatus);

      if (isModeratedStatus(nextStatus)) {
        Object.assign(data, moderationMetadata(getAdminUserFromRequestContext()));
      }

      const requestMeta = getRequestMetadata();
      await log(
        'blog',
        'INFO',
        'blog.comment.status.transition',
        `Blog comment status updated: ${currentStatus} -> ${nextStatus}`,
        {
          from: currentStatus,
          to: nextStatus,
        },
        {
          request_id: requestMeta.requestId,
          actor: requestMeta.actor,
          entity_ref: existing.comment_id || null,
        }
      );
    }

    event.params.data = data;
  },
};
