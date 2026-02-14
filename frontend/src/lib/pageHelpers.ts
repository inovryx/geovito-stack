import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, pathForLanguage, toHreflang, type SiteLanguage } from './languages';

const siteUrl =
  (import.meta.env.PUBLIC_SITE_URL as string | undefined) ||
  (import.meta.env.SITE as string | undefined) ||
  'https://www.geovito.com';

const normalizeSiteOrigin = (value: string) => {
  try {
    const parsed = new URL(value);
    if (import.meta.env.PROD && parsed.hostname.startsWith('www.')) {
      parsed.hostname = parsed.hostname.slice(4);
    }
    return parsed.origin;
  } catch {
    return value.replace(/\/$/, '');
  }
};

const normalizedSite = normalizeSiteOrigin(siteUrl);

export const absoluteUrl = (path: string) =>
  path.startsWith('http') ? path : `${normalizedSite}${path.startsWith('/') ? path : `/${path}`}`;

export const buildLanguageLinks = (pathByLanguage: Record<string, string>) => {
  const links: Record<string, string> = {};

  for (const language of SUPPORTED_LANGUAGES) {
    const resolvedPath = pathByLanguage[language] || pathByLanguage[DEFAULT_LANGUAGE] || pathForLanguage(language);
    links[language] = absoluteUrl(resolvedPath);
  }

  return links;
};

export const toAlternates = (languageLinks: Record<string, string>) =>
  SUPPORTED_LANGUAGES.filter((language) => Boolean(languageLinks[language])).map((language) => ({
    hreflang: toHreflang(language),
    href: languageLinks[language],
  }));

export const languagePathMap = (builder: (language: SiteLanguage) => string) => {
  const map: Record<string, string> = {};
  for (const language of SUPPORTED_LANGUAGES) {
    map[language] = builder(language);
  }
  return map;
};
