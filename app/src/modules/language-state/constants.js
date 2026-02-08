'use strict';

const SUPPORTED_LANGUAGES = Object.freeze(['en', 'de', 'es', 'ru', 'zh-cn']);
const DEFAULT_LANGUAGE = 'en';

const LANGUAGE_STATUS = Object.freeze({
  MISSING: 'missing',
  DRAFT: 'draft',
  COMPLETE: 'complete',
});

module.exports = {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_STATUS,
};
