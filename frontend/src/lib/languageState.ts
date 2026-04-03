import { DEFAULT_LANGUAGE, type SiteLanguage } from './languages';

export type TranslationStatus = 'missing' | 'draft' | 'complete';

export type LocalizedEmbedItem = {
  provider: 'youtube' | 'facebook';
  source_url: string;
  title?: string;
  caption?: string;
  start_seconds?: number;
};

export type LocalizedContent = {
  /** Stored language tag from Strapi (may be any supported authoring locale, not only routed UI codes). */
  language: string;
  status: TranslationStatus;
  title?: string;
  slug?: string;
  excerpt?: string;
  body?: string;
  embeds?: LocalizedEmbedItem[];
  last_reviewed_at?: string | null;
  canonical_path?: string;
  runtime_translation?: boolean;
  indexable?: boolean;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    canonicalUrl?: string;
  };
};

export type TranslationResolution = {
  requested: LocalizedContent | null;
  complete: LocalizedContent | null;
  output: LocalizedContent | null;
  isFallback: boolean;
  isRuntime: boolean;
  indexable: boolean;
};

const byLanguage = (translations: LocalizedContent[]) => {
  const map = new Map<string, LocalizedContent>();
  for (const translation of translations) {
    const key = String(translation.language || '').trim().toLowerCase();
    if (key) map.set(key, translation);
  }
  return map;
};

export const findCompleteTranslation = (
  translations: LocalizedContent[],
  preferredLanguage: SiteLanguage,
  canonicalLanguage: SiteLanguage = DEFAULT_LANGUAGE
): LocalizedContent | null => {
  const translationMap = byLanguage(translations);
  const preferred = translationMap.get(String(preferredLanguage || '').trim().toLowerCase());

  if (preferred?.status === 'complete') return preferred;

  const canonical = translationMap.get(String(canonicalLanguage || '').trim().toLowerCase());
  if (canonical?.status === 'complete') return canonical;

  return translations.find((item) => item.status === 'complete') || null;
};

export const resolveTranslation = (
  translations: LocalizedContent[],
  requestedLanguage: SiteLanguage,
  canonicalLanguage: SiteLanguage = DEFAULT_LANGUAGE,
  runtimeMode = false
): TranslationResolution => {
  const translationMap = byLanguage(translations);
  const requested = translationMap.get(String(requestedLanguage || '').trim().toLowerCase()) || null;
  const complete = findCompleteTranslation(translations, requestedLanguage, canonicalLanguage);

  if (!complete) {
    return {
      requested,
      complete: null,
      output: null,
      isFallback: true,
      isRuntime: false,
      indexable: false,
    };
  }

  const requestedIsComplete = requested?.status === 'complete';
  const useRuntime = runtimeMode && !requestedIsComplete;
  const output = requestedIsComplete ? requested : complete;
  const isFallback = !requestedIsComplete || useRuntime;
  const indexable = requestedIsComplete && !useRuntime && output?.indexable !== false;

  return {
    requested,
    complete,
    output,
    isFallback,
    isRuntime: useRuntime,
    indexable,
  };
};
