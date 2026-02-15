import { ATLAS_CONTENT_LANGUAGES, DEFAULT_LANGUAGE, pathForLanguage, type SiteLanguage } from './languages';
import type { LocalizedContent, TranslationResolution } from './languageState';

export type IndexGateDecision = {
  indexable: boolean;
  robots: 'index,follow' | 'noindex,nofollow';
};

const normalizeRelativePath = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

export const resolveIndexGate = (
  isMock: boolean,
  resolution: TranslationResolution,
  requestedLanguage: SiteLanguage
): IndexGateDecision => {
  const requestedComplete = resolution.requested?.status === 'complete';
  const indexable =
    !isMock && requestedLanguage === DEFAULT_LANGUAGE && requestedComplete && !resolution.isRuntime && resolution.indexable;

  return {
    indexable,
    robots: indexable ? 'index,follow' : 'noindex,nofollow',
  };
};

export const buildIndexableLanguagePathMap = (
  translations: LocalizedContent[],
  routePrefix: string,
  isMock: boolean
) => {
  const map: Record<string, string> = {};
  if (isMock) return map;

  for (const translation of translations) {
    const language = String(translation?.language || '').trim().toLowerCase() as SiteLanguage;
    if (!ATLAS_CONTENT_LANGUAGES.includes(language)) continue;
    if (language !== DEFAULT_LANGUAGE) continue;
    if (translation.status !== 'complete') continue;
    if (translation.runtime_translation) continue;
    if (translation.indexable === false) continue;

    const slug = String(translation.slug || '').trim();
    if (!slug) continue;

    map[language] = normalizeRelativePath(translation.canonical_path || pathForLanguage(language, `${routePrefix}/${slug}`));
  }

  return map;
};
