import { ATLAS_CONTENT_LANGUAGES, DEFAULT_PUBLIC_LANGUAGE, isPublicReleasedLanguage } from './languages';
import { buildIndexableLanguagePathMap } from './indexGate';
import { absoluteUrl } from './pageHelpers';
import { getAtlasPlaces, getBlogPosts, getRegionGroups } from './strapi';

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
      if (!byLanguage.has(language)) {
        byLanguage.set(language, new Set());
      }
      byLanguage.get(language)?.add(absoluteUrl(urlPath));
    }
  }

  const ugcIndexableEnUrls = new Set<string>();
  for (const post of blogPosts) {
    if (post?.mock === true) continue;
    if (post?.content_source !== 'user') continue;
    if (post?.submission_state !== 'approved') continue;

    const translations = Array.isArray(post?.translations) ? post.translations : [];
    const enComplete = translations.find(
      (entry) =>
        String(entry?.language || '').trim().toLowerCase() === 'en' &&
        entry?.status === 'complete' &&
        entry?.runtime_translation !== true &&
        entry?.indexable !== false
    );
    const slug = String(enComplete?.slug || '').trim();
    if (!slug) continue;

    const canonicalPath = String(enComplete?.canonical_path || '').trim();
    const resolvedPath = canonicalPath || `/en/blog/${slug}/`;
    ugcIndexableEnUrls.add(absoluteUrl(resolvedPath));
  }

  const chunks: SitemapChunk[] = [];

  for (const language of sitemapAtlasLanguages) {
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

  if (ugcIndexableEnUrls.size > 0) {
    const sorted = Array.from(ugcIndexableEnUrls).sort((left, right) => left.localeCompare(right));
    const segmented = chunkArray(sorted, SITEMAP_CHUNK_SIZE);
    segmented.forEach((urls, chunkIndex) => {
      const chunk = chunkIndex + 1;
      chunks.push({
        bucket: `ugc-en-${chunk}`,
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
