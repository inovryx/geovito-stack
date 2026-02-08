'use strict';

const crypto = require('crypto');
const { errors } = require('@strapi/utils');
const { ALLOWED_TRANSITIONS, SUGGESTION_STATUS } = require('./constants');

const assertAllowedTransition = (currentStatus, nextStatus) => {
  if (!currentStatus || !nextStatus || currentStatus === nextStatus) {
    return;
  }

  const allowedTargets = ALLOWED_TRANSITIONS[currentStatus] || [];

  if (!allowedTargets.includes(nextStatus)) {
    throw new errors.ValidationError(
      `Illegal status transition: ${currentStatus} -> ${nextStatus}`
    );
  }
};

const requireModerationNotes = (notes, nextStatus) => {
  if (nextStatus !== SUGGESTION_STATUS.ACCEPTED && nextStatus !== SUGGESTION_STATUS.REJECTED) {
    return;
  }

  if (typeof notes !== 'string' || notes.trim().length < 5) {
    throw new errors.ValidationError(
      'moderation_notes is required (minimum 5 chars) when setting status to accepted/rejected'
    );
  }
};

const moderationMetadata = (adminUser) => {
  const metadata = {
    reviewed_at: new Date(),
  };

  if (adminUser && typeof adminUser === 'object') {
    if (typeof adminUser.id === 'number') {
      metadata.reviewed_by_admin_id = adminUser.id;
    }

    if (typeof adminUser.email === 'string') {
      metadata.reviewed_by_admin_email = adminUser.email;
    }
  }

  return metadata;
};

const hashIp = (input) => {
  if (!input || typeof input !== 'string') return '';
  return crypto.createHash('sha256').update(input).digest('hex');
};

module.exports = {
  assertAllowedTransition,
  requireModerationNotes,
  moderationMetadata,
  hashIp,
};
