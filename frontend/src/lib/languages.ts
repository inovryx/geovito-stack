import rawSiteLanguageRegistry from '../config/site-language-release-registry.json';

export const SITE_LANGUAGE_RELEASE_STATES = ['registered', 'review', 'released', 'hidden'] as const;
export type SiteLanguageReleaseState = (typeof SITE_LANGUAGE_RELEASE_STATES)[number];

type RawSiteLanguageRegistry = {
  default_public_language?: string;
  preview?: {
    query_param?: string;
    storage_key?: string;
  };
  languages?: Array<{
    code?: string;
    state?: string;
  }>;
};

const registry = rawSiteLanguageRegistry as RawSiteLanguageRegistry;

const normalizeLanguageCode = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase();

const isReleaseState = (value: string): value is SiteLanguageReleaseState =>
  SITE_LANGUAGE_RELEASE_STATES.includes(value as SiteLanguageReleaseState);

const rawEntries = Array.isArray(registry.languages) ? registry.languages : [];
const normalizedEntries = rawEntries
  .map((entry) => ({
    code: normalizeLanguageCode(String(entry?.code || '')),
    state: String(entry?.state || 'registered').trim().toLowerCase(),
  }))
  .filter((entry) => Boolean(entry.code) && isReleaseState(entry.state));

const uniqueEntries = (() => {
  const seen = new Set<string>();
  const rows: Array<{ code: string; state: SiteLanguageReleaseState }> = [];
  for (const entry of normalizedEntries) {
    if (seen.has(entry.code)) continue;
    seen.add(entry.code);
    rows.push({ code: entry.code, state: entry.state as SiteLanguageReleaseState });
  }
  return rows;
})();

if (uniqueEntries.length === 0) {
  throw new Error('Site language release registry is empty.');
}

export const SITE_UI_LANGUAGE_REGISTRY = uniqueEntries;

export const SITE_UI_LANGUAGES = SITE_UI_LANGUAGE_REGISTRY.map((entry) => entry.code);
export type SiteLanguage = (typeof SITE_UI_LANGUAGES)[number];

export const ROUTABLE_SITE_UI_LANGUAGES = SITE_UI_LANGUAGES;
// Backward-compatible alias for existing route/UI usage.
export const SUPPORTED_LANGUAGES = ROUTABLE_SITE_UI_LANGUAGES;

const releaseStateByLanguage = new Map<string, SiteLanguageReleaseState>(
  SITE_UI_LANGUAGE_REGISTRY.map((entry) => [entry.code, entry.state])
);

export const getSiteLanguageReleaseState = (language: string): SiteLanguageReleaseState => {
  const normalized = normalizeLanguageCode(language);
  return releaseStateByLanguage.get(normalized) || 'registered';
};

export const isSupportedLanguage = (value: string): value is SiteLanguage =>
  releaseStateByLanguage.has(normalizeLanguageCode(value));

export const isPublicReleasedLanguage = (value: string): value is SiteLanguage =>
  getSiteLanguageReleaseState(value) === 'released';

export const PUBLIC_RELEASED_SITE_UI_LANGUAGES = SITE_UI_LANGUAGES.filter((language) =>
  isPublicReleasedLanguage(language)
);

export const DEFAULT_LANGUAGE: SiteLanguage = isSupportedLanguage('en') ? 'en' : SITE_UI_LANGUAGES[0];

const configuredDefaultPublicLanguage = normalizeLanguageCode(String(registry.default_public_language || DEFAULT_LANGUAGE));
export const DEFAULT_PUBLIC_LANGUAGE: SiteLanguage = isPublicReleasedLanguage(configuredDefaultPublicLanguage)
  ? configuredDefaultPublicLanguage
  : isPublicReleasedLanguage(DEFAULT_LANGUAGE)
    ? DEFAULT_LANGUAGE
    : PUBLIC_RELEASED_SITE_UI_LANGUAGES[0] || DEFAULT_LANGUAGE;

export const resolvePublicLanguage = (value: string | null | undefined): SiteLanguage => {
  const normalized = normalizeLanguageCode(String(value || ''));
  if (isPublicReleasedLanguage(normalized)) return normalized;
  if (normalized.startsWith('zh') && isPublicReleasedLanguage('zh-cn')) return 'zh-cn';

  const primary = normalized.split('-')[0];
  if (isPublicReleasedLanguage(primary)) return primary;

  return DEFAULT_PUBLIC_LANGUAGE;
};

export const SITE_LANGUAGE_PREVIEW_QUERY_PARAM = String(registry.preview?.query_param || 'ui_lang_preview').trim() || 'ui_lang_preview';
export const SITE_LANGUAGE_PREVIEW_STORAGE_KEY =
  String(registry.preview?.storage_key || 'geovito_ui_lang_preview_v1').trim() || 'geovito_ui_lang_preview_v1';

export const ATLAS_CONTENT_LANGUAGES = ['en', 'tr', 'de', 'es', 'ru', 'zh-cn'] as const;
export type AtlasLanguage = (typeof ATLAS_CONTENT_LANGUAGES)[number];

const HREFLANG_MAP: Record<string, string> = {
  en: 'en',
  tr: 'tr',
  de: 'de',
  es: 'es',
  ru: 'ru',
  'zh-cn': 'zh-CN',
  fr: 'fr',
};

export const isAtlasLanguage = (value: string): value is AtlasLanguage =>
  ATLAS_CONTENT_LANGUAGES.includes(value as AtlasLanguage);

export const toHreflang = (language: SiteLanguage) => HREFLANG_MAP[language] || language;

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
