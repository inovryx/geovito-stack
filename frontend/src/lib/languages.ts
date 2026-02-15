export const SITE_UI_LANGUAGES = ['en', 'tr', 'de', 'es', 'ru', 'zh-cn', 'fr'] as const;
export const ATLAS_CONTENT_LANGUAGES = ['en', 'tr', 'de', 'es', 'ru', 'zh-cn'] as const;

// Backward-compatible alias for existing route/UI usage.
export const SUPPORTED_LANGUAGES = SITE_UI_LANGUAGES;

export type SiteLanguage = (typeof SITE_UI_LANGUAGES)[number];
export type AtlasLanguage = (typeof ATLAS_CONTENT_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SiteLanguage = 'en';

const HREFLANG_MAP: Record<SiteLanguage, string> = {
  en: 'en',
  tr: 'tr',
  de: 'de',
  es: 'es',
  ru: 'ru',
  'zh-cn': 'zh-CN',
  fr: 'fr',
};

export const isSupportedLanguage = (value: string): value is SiteLanguage =>
  SITE_UI_LANGUAGES.includes(value as SiteLanguage);

export const isAtlasLanguage = (value: string): value is AtlasLanguage =>
  ATLAS_CONTENT_LANGUAGES.includes(value as AtlasLanguage);

export const toHreflang = (language: SiteLanguage) => HREFLANG_MAP[language];

export const pathForLanguage = (language: SiteLanguage, path = '') => {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return normalizedPath ? `/${language}/${normalizedPath}/` : `/${language}/`;
};

export const normalizeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
