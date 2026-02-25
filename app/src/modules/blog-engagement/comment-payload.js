'use strict';

const { errors } = require('@strapi/utils');
const { COMMENT_PUBLIC_LIMITS } = require('./constants');
const { sanitizeEmail, sanitizeLanguage, sanitizeText } = require('../suggestions/sanitize');

const validateLength = (value, max, fieldName, required = true) => {
  if (required && (!value || value.length === 0)) {
    throw new errors.ValidationError(`${fieldName} is required`);
  }

  if (value && value.length > max) {
    throw new errors.ValidationError(`${fieldName} exceeds max length (${max})`);
  }
};

const unwrapPayload = (payload) => {
  if (
    payload &&
    typeof payload === 'object' &&
    payload.data &&
    typeof payload.data === 'object' &&
    !Array.isArray(payload.data)
  ) {
    return payload.data;
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload;
  }

  return {};
};

const normalizePublicCommentPayload = (payload = {}, options = {}) => {
  const input = unwrapPayload(payload);
  const isAuthenticated = Boolean(options.isAuthenticated);

  const postId = sanitizeText(input.post_id);
  const body = sanitizeText(input.body);
  const language = sanitizeLanguage(input.language || 'en');
  const guestDisplayName = sanitizeText(input.display_name || input.guest_display_name || '');
  const guestEmail = sanitizeEmail(input.email || input.guest_email || '');
  const parentCommentId = sanitizeText(input.parent_comment_id || '');

  validateLength(postId, 120, 'post_id');
  validateLength(body, COMMENT_PUBLIC_LIMITS.BODY_MAX, 'body');
  validateLength(language, COMMENT_PUBLIC_LIMITS.LANGUAGE_MAX, 'language');
  validateLength(guestDisplayName, COMMENT_PUBLIC_LIMITS.DISPLAY_NAME_MAX, 'display_name', false);
  validateLength(parentCommentId, 160, 'parent_comment_id', false);

  if (!isAuthenticated) {
    validateLength(guestEmail, COMMENT_PUBLIC_LIMITS.EMAIL_MAX, 'email');
    if (!guestEmail.includes('@')) {
      throw new errors.ValidationError('email must be valid');
    }
  }

  return {
    post_id: postId,
    body,
    language,
    guest_display_name: guestDisplayName || null,
    guest_email: isAuthenticated ? null : guestEmail,
    parent_comment_id: parentCommentId || null,
  };
};

module.exports = {
  normalizePublicCommentPayload,
};
