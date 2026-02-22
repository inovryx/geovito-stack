'use strict';

const BLOG_COMMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SPAM: 'spam',
  DELETED: 'deleted',
});

const BLOG_COMMENT_SOURCE = Object.freeze({
  REGISTERED: 'registered',
  GUEST: 'guest',
});

const COMMENT_PUBLIC_LIMITS = Object.freeze({
  BODY_MAX: 4000,
  DISPLAY_NAME_MAX: 120,
  EMAIL_MAX: 320,
  LANGUAGE_MAX: 16,
  RATE_WINDOW_MS: 10 * 60 * 1000,
  RATE_MAX_REQUESTS: 10,
});

const LIKE_LIMITS = Object.freeze({
  RATE_WINDOW_MS: 60 * 1000,
  RATE_MAX_REQUESTS: 60,
});

const parseIntEnv = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getGuestMaxLinks = () => {
  const fallback = 1;
  return Math.max(0, parseIntEnv(process.env.BLOG_COMMENT_GUEST_MAX_LINKS, fallback));
};

const getGuestSpamLinks = () => {
  const fallback = 3;
  const raw = Math.max(0, parseIntEnv(process.env.BLOG_COMMENT_GUEST_SPAM_LINKS, fallback));
  const min = getGuestMaxLinks() + 1;
  return Math.max(raw, min);
};

const getRegisteredAutoApproveAfter = () => {
  const fallback = 2;
  return Math.max(0, parseIntEnv(process.env.BLOG_COMMENT_REGISTERED_AUTO_APPROVE_AFTER, fallback));
};

module.exports = {
  BLOG_COMMENT_STATUS,
  BLOG_COMMENT_SOURCE,
  COMMENT_PUBLIC_LIMITS,
  LIKE_LIMITS,
  getRegisteredAutoApproveAfter,
  getGuestMaxLinks,
  getGuestSpamLinks,
  parseIntEnv,
};
