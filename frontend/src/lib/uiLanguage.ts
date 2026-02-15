import en from '../i18n/en.json';
import tr from '../i18n/tr.json';
import de from '../i18n/de.json';
import es from '../i18n/es.json';
import ru from '../i18n/ru.json';
import zhCn from '../i18n/zh-cn.json';
import fr from '../i18n/fr.json';
import { DEFAULT_LANGUAGE, SITE_UI_LANGUAGES, type SiteLanguage } from './languages';

type Dictionary = Record<string, unknown>;

const dictionaries: Record<SiteLanguage, Dictionary> = {
  en,
  tr,
  de,
  es,
  ru,
  'zh-cn': zhCn,
  fr,
};

const getByPath = (dictionary: Dictionary, path: string): unknown => {
  return path.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
};

const interpolate = (text: string, params: Record<string, string | number> = {}) =>
  text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));

const makeFallbackText = (key: string) => {
  const tail = key.split('.').pop() || '';
  const normalized = tail
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return normalized || 'Text unavailable';
};

export const getUiMessages = (language: SiteLanguage): Dictionary => {
  return dictionaries[language] || dictionaries[DEFAULT_LANGUAGE];
};

export const translate = (
  messages: Dictionary,
  key: string,
  params: Record<string, string | number> = {},
  fallback?: string
) => {
  const value = getByPath(messages, key);

  if (typeof value === 'string') {
    return interpolate(value, params);
  }

  const fallbackValue = getByPath(dictionaries[DEFAULT_LANGUAGE], key);
  if (typeof fallbackValue === 'string') {
    return interpolate(fallbackValue, params);
  }

  return fallback || makeFallbackText(key);
};

const normalizeLanguageCode = (value: string | null | undefined): SiteLanguage | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();

  if (SITE_UI_LANGUAGES.includes(normalized as SiteLanguage)) {
    return normalized as SiteLanguage;
  }

  if (normalized.startsWith('zh')) {
    return 'zh-cn';
  }

  const primary = normalized.split('-')[0];
  if (SITE_UI_LANGUAGES.includes(primary as SiteLanguage)) {
    return primary as SiteLanguage;
  }

  return null;
};

export const resolvePreferredLanguage = (candidateLanguages: Array<string | null | undefined>) => {
  for (const candidate of candidateLanguages) {
    const normalized = normalizeLanguageCode(candidate);
    if (normalized) return normalized;
  }

  return DEFAULT_LANGUAGE;
};
