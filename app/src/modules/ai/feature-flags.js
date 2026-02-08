'use strict';

const DEFAULT_AUTHOR_LANGUAGES = Object.freeze(['en', 'de', 'es', 'ru', 'zh-cn']);

const parseBool = (value) => String(value || '').trim().toLowerCase() === 'true';

const parseLanguageList = (value) => {
  if (!value) return [...DEFAULT_AUTHOR_LANGUAGES];
  const languages = String(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return languages.length > 0 ? languages : [...DEFAULT_AUTHOR_LANGUAGES];
};

const getAiFlags = () => ({
  enabled: parseBool(process.env.AI_ENABLED),
  diagnosticsEnabled: parseBool(process.env.AI_DIAGNOSTICS_ENABLED),
  draftEnabled: parseBool(process.env.AI_DRAFT_ENABLED),
  authorLanguages: parseLanguageList(process.env.AI_AUTHOR_LANGUAGES),
});

module.exports = {
  DEFAULT_AUTHOR_LANGUAGES,
  getAiFlags,
};
