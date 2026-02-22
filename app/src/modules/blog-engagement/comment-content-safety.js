'use strict';

const { BLOG_COMMENT_STATUS } = require('./constants');

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>()"'`]+/gi;

const detectUrlCount = (rawBody) => {
  const text = String(rawBody || '');
  const matches = text.match(URL_PATTERN);
  return Array.isArray(matches) ? matches.length : 0;
};

const evaluateGuestCommentSafety = (rawBody, policy) => {
  const urlCount = detectUrlCount(rawBody);
  const maxLinks = Math.max(0, Number.parseInt(String(policy?.maxLinks ?? 1), 10) || 0);
  const spamLinks = Math.max(maxLinks + 1, Number.parseInt(String(policy?.spamLinks ?? 3), 10) || 3);

  if (urlCount >= spamLinks) {
    return {
      urlCount,
      forcedStatus: BLOG_COMMENT_STATUS.SPAM,
      moderationNotes: `auto-flag: too_many_links (url_count=${urlCount}, spam_threshold=${spamLinks})`,
    };
  }

  if (urlCount > maxLinks) {
    return {
      urlCount,
      forcedStatus: BLOG_COMMENT_STATUS.PENDING,
      moderationNotes: `auto-hold: review_links (url_count=${urlCount}, max_links=${maxLinks})`,
    };
  }

  return {
    urlCount,
    forcedStatus: null,
    moderationNotes: null,
  };
};

module.exports = {
  detectUrlCount,
  evaluateGuestCommentSafety,
};
