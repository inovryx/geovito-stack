'use strict';

const stripHtmlAndScripts = (value) => {
  if (typeof value !== 'string') return '';

  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const sanitizeText = (value) => stripHtmlAndScripts(value);

const sanitizeLanguage = (value) => {
  if (typeof value !== 'string') return 'en';
  return value.trim().toLowerCase();
};

const sanitizeEmail = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

module.exports = {
  sanitizeText,
  sanitizeLanguage,
  sanitizeEmail,
};
