import { resolveTranslation, type LocalizedContent } from './languageState';
import type { SiteLanguage } from './languages';

export const chooseSlugForLanguage = (
  translations: LocalizedContent[],
  language: SiteLanguage,
  canonicalLanguage: SiteLanguage
) => {
  const resolved = resolveTranslation(translations, language, canonicalLanguage);
  const requested = resolved.requested;
  const complete = resolved.complete;

  if (!complete?.slug) return null;

  return requested?.status === 'complete' && requested.slug ? requested.slug : complete.slug;
};
