import { SUPPORTED_LANGUAGES } from './languages';
import { buildIndexableLanguagePathMap } from './indexGate';
import { absoluteUrl } from './pageHelpers';
import { getAtlasPlaces } from './strapi';

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
  const places = await getAtlasPlaces();
  const byLanguage = new Map<string, Set<string>>();

  for (const language of SUPPORTED_LANGUAGES) {
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

  const chunks: SitemapChunk[] = [];

  for (const language of SUPPORTED_LANGUAGES) {
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
