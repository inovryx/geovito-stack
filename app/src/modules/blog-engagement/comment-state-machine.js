'use strict';

const { errors } = require('@strapi/utils');
const { BLOG_COMMENT_STATUS } = require('./constants');

const ALLOWED_TRANSITIONS = Object.freeze({
  [BLOG_COMMENT_STATUS.PENDING]: new Set([
    BLOG_COMMENT_STATUS.PENDING,
    BLOG_COMMENT_STATUS.APPROVED,
    BLOG_COMMENT_STATUS.REJECTED,
    BLOG_COMMENT_STATUS.SPAM,
    BLOG_COMMENT_STATUS.DELETED,
  ]),
  [BLOG_COMMENT_STATUS.APPROVED]: new Set([
    BLOG_COMMENT_STATUS.APPROVED,
    BLOG_COMMENT_STATUS.REJECTED,
    BLOG_COMMENT_STATUS.SPAM,
    BLOG_COMMENT_STATUS.DELETED,
  ]),
  [BLOG_COMMENT_STATUS.REJECTED]: new Set([
    BLOG_COMMENT_STATUS.REJECTED,
    BLOG_COMMENT_STATUS.APPROVED,
    BLOG_COMMENT_STATUS.DELETED,
  ]),
  [BLOG_COMMENT_STATUS.SPAM]: new Set([
    BLOG_COMMENT_STATUS.SPAM,
    BLOG_COMMENT_STATUS.REJECTED,
    BLOG_COMMENT_STATUS.DELETED,
  ]),
  [BLOG_COMMENT_STATUS.DELETED]: new Set([BLOG_COMMENT_STATUS.DELETED]),
});

const moderatedStatuses = new Set([
  BLOG_COMMENT_STATUS.APPROVED,
  BLOG_COMMENT_STATUS.REJECTED,
  BLOG_COMMENT_STATUS.SPAM,
  BLOG_COMMENT_STATUS.DELETED,
]);

const noteRequiredStatuses = new Set([
  BLOG_COMMENT_STATUS.REJECTED,
  BLOG_COMMENT_STATUS.SPAM,
  BLOG_COMMENT_STATUS.DELETED,
]);

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const assertAllowedTransition = (fromStatus, toStatus) => {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) {
    throw new errors.ValidationError(`Unsupported comment status: ${fromStatus}`);
  }
  if (!allowed.has(to)) {
    throw new errors.ValidationError(`Illegal comment status transition: ${from} -> ${to}`);
  }
};

const requireModerationNotes = (notes, nextStatus) => {
  const status = normalizeStatus(nextStatus);
  if (!noteRequiredStatuses.has(status)) {
    return;
  }
  if (!String(notes || '').trim()) {
    throw new errors.ValidationError(`moderation_notes is required when status=${status}`);
  }
};

const resolveReviewerLabel = (adminUser) => {
  if (!adminUser || typeof adminUser !== 'object') return 'system';

  const candidates = [
    adminUser.firstname && adminUser.lastname
      ? `${adminUser.firstname} ${adminUser.lastname}`
      : null,
    adminUser.username,
    adminUser.email,
  ];

  const resolved = candidates.find((item) => typeof item === 'string' && item.trim());
  return String(resolved || 'admin').trim().slice(0, 160);
};

const moderationMetadata = (adminUser) => ({
  reviewed_at: new Date().toISOString(),
  reviewed_by: resolveReviewerLabel(adminUser),
});

const isModeratedStatus = (status) => moderatedStatuses.has(normalizeStatus(status));

module.exports = {
  assertAllowedTransition,
  requireModerationNotes,
  moderationMetadata,
  isModeratedStatus,
};
