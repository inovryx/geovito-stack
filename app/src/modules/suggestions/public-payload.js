'use strict';

const { errors } = require('@strapi/utils');
const { PUBLIC_LIMITS, SUGGESTION_TYPES } = require('./constants');
const { sanitizeEmail, sanitizeLanguage, sanitizeText } = require('./sanitize');

const validateLength = (value, max, fieldName, required = true) => {
  if (required && (!value || value.length === 0)) {
    throw new errors.ValidationError(`${fieldName} is required`);
  }

  if (value && value.length > max) {
    throw new errors.ValidationError(`${fieldName} exceeds max length (${max})`);
  }
};

const normalizeEvidenceUrls = (input) => {
  const values = Array.isArray(input) ? input : [];

  if (values.length > PUBLIC_LIMITS.EVIDENCE_URL_MAX_ITEMS) {
    throw new errors.ValidationError(
      `evidence_urls cannot contain more than ${PUBLIC_LIMITS.EVIDENCE_URL_MAX_ITEMS} items`
    );
  }

  const normalized = [];

  for (const rawValue of values) {
    const value = sanitizeText(rawValue);

    if (!value) continue;

    if (value.length > PUBLIC_LIMITS.EVIDENCE_URL_MAX_LENGTH) {
      throw new errors.ValidationError('evidence_urls item exceeds max length');
    }

    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new errors.ValidationError('evidence_urls items must be valid URLs');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new errors.ValidationError('evidence_urls only allow http/https');
    }

    normalized.push(parsed.toString());
  }

  return normalized;
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

const normalizePublicSuggestionPayload = (payload = {}) => {
  const input = unwrapPayload(payload);
  const suggestionType = sanitizeText(input.suggestion_type).toLowerCase();

  if (!SUGGESTION_TYPES.includes(suggestionType)) {
    throw new errors.ValidationError(
      `suggestion_type must be one of: ${SUGGESTION_TYPES.join(', ')}`
    );
  }

  const title = sanitizeText(input.title);
  const description = sanitizeText(input.description);
  const targetPlaceRef = sanitizeText(input.target_place_ref || input.target_place_place_id || '');
  const displayName = sanitizeText(input.display_name);
  const email = sanitizeEmail(input.email);
  const language = sanitizeLanguage(input.language || 'en');

  validateLength(title, PUBLIC_LIMITS.TITLE_MAX, 'title');
  validateLength(description, PUBLIC_LIMITS.DESCRIPTION_MAX, 'description');
  validateLength(targetPlaceRef, PUBLIC_LIMITS.TARGET_REF_MAX, 'target_place_ref', false);
  validateLength(displayName, PUBLIC_LIMITS.DISPLAY_NAME_MAX, 'display_name', false);
  validateLength(language, PUBLIC_LIMITS.LANGUAGE_MAX, 'language');

  const evidenceUrls = normalizeEvidenceUrls(input.evidence_urls);

  return {
    suggestion_type: suggestionType,
    title,
    description,
    target_place_ref: targetPlaceRef || null,
    evidence_urls: evidenceUrls,
    language,
    submitted_by_display_name: displayName || null,
    submitted_by_email: email || null,
  };
};

module.exports = {
  normalizePublicSuggestionPayload,
};
