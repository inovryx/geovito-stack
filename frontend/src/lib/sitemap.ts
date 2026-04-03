import { ATLAS_CONTENT_LANGUAGES, DEFAULT_LANGUAGE, DEFAULT_PUBLIC_LANGUAGE, isPublicReleasedLanguage } from './languages';
import { buildIndexableLanguagePathMap } from './indexGate';
import { absoluteUrl } from './pageHelpers';
import { getAtlasPlaces, getBlogPosts, getRegionGroups } from './strapi';
import { resolveBlogPostSitemapRelPath } from './ugcPostRules';

const resolveChunkSize = () => {
  const rawValue = Number(import.meta.env.SITEMAP_CHUNK_SIZE || 5000);
  if (!Number.isFinite(rawValue) || rawValue <= 0) return 5000;
  return Math.max(100, Math.trunc(rawValue));
};

export const SITEMAP_CHUNK_SIZE = resolveChunkSize();

export type SitemapChunk = {
  bucket: string;
  language: string;
  chunk: number;
  urls: string[];
};

const escapeXml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

/**
 * Sitemap chunks for Atlas, RegionGroup, and EN blog URLs.
 * Index-eligible URLs align with pages: EN + translation complete + non-mock + indexable !== false
 * (buildIndexableLanguagePathMap / resolveBlogPostSitemapRelPath), and only UI-released languages
 * get atlas/region bucket entries (blog EN URLs additionally require DEFAULT_LANGUAGE released).
 */
export const buildAtlasSitemapChunks = async () => {
  const [places, regionGroups, blogPosts] = await Promise.all([getAtlasPlaces(), getRegionGroups(), getBlogPosts()]);
  const byLanguage = new Map<string, Set<string>>();
  const sitemapAtlasLanguages: string[] = (() => {
    const released = ATLAS_CONTENT_LANGUAGES.filter((language) => isPublicReleasedLanguage(language));
    if (released.length > 0) return released;
    return [DEFAULT_PUBLIC_LANGUAGE];
  })();

  for (const language of sitemapAtlasLanguages) {
    byLanguage.set(language, new Set());
  }

  for (const place of places) {
    const languagePathMap = buildIndexableLanguagePathMap(place.translations, 'atlas', place.mock === true);
    for (const [language, urlPath] of Object.entries(languagePathMap)) {
      if (!isPublicReleasedLanguage(language)) continue;
      if (!byLanguage.has(language)) {
        byLanguage.set(language, new Set());
      }
      byLanguage.get(language)?.add(absoluteUrl(urlPath));
    }
  }

  for (const regionGroup of regionGroups) {
    const languagePathMap = buildIndexableLanguagePathMap(
      regionGroup.translations,
      'regions',
      regionGroup.mock === true
    );
    for (const [language, urlPath] of Object.entries(languagePathMap)) {
      if (!isPublicReleasedLanguage(language)) continue;
      if (!byLanguage.has(language)) {
        byLanguage.set(language, new Set());
      }
      byLanguage.get(language)?.add(absoluteUrl(urlPath));
    }
  }

  const blogIndexableEnUrls = new Set<string>();
  if (isPublicReleasedLanguage(DEFAULT_LANGUAGE)) {
    for (const post of blogPosts) {
      const rel = resolveBlogPostSitemapRelPath(post);
      if (!rel) continue;
      blogIndexableEnUrls.add(absoluteUrl(rel));
    }
  }

  const chunks: SitemapChunk[] = [];

  for (const language of sitemapAtlasLanguages) {
    if (!isPublicReleasedLanguage(language)) continue;
    const urlSet = byLanguage.get(language);
    if (!urlSet || urlSet.size === 0) continue;

    const sortedUrls = Array.from(urlSet).sort((left, right) => left.localeCompare(right));
    const segmented = chunkArray(sortedUrls, SITEMAP_CHUNK_SIZE);

    segmented.forEach((urls, chunkIndex) => {
      const chunk = chunkIndex + 1;
      chunks.push({
        bucket: `atlas-${language}-${chunk}`,
        language,
        chunk,
        urls,
      });
    });
  }

  if (blogIndexableEnUrls.size > 0) {
    const sorted = Array.from(blogIndexableEnUrls).sort((left, right) => left.localeCompare(right));
    const segmented = chunkArray(sorted, SITEMAP_CHUNK_SIZE);
    segmented.forEach((urls, chunkIndex) => {
      const chunk = chunkIndex + 1;
      chunks.push({
        bucket: `blog-en-${chunk}`,
        language: 'en',
        chunk,
        urls,
      });
    });
  }

  return chunks;
};

export const toUrlSetXml = (urls: string[]) => {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
    '</urlset>',
    '',
  ];

  return lines.join('\n');
};

export const toSitemapIndexXml = (sitemapUrls: string[]) => {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemapUrls.map((url) => `  <sitemap><loc>${escapeXml(url)}</loc></sitemap>`),
    '</sitemapindex>',
    '',
  ];

  return lines.join('\n');
};
