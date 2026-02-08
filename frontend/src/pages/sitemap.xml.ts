import { absoluteUrl } from '../lib/pageHelpers';
import { buildAtlasSitemapChunks, toSitemapIndexXml } from '../lib/sitemap';

export const prerender = true;

export async function GET() {
  const chunks = await buildAtlasSitemapChunks();
  const sitemapUrls = chunks.map((chunk) => absoluteUrl(`/sitemaps/${chunk.bucket}.xml`));
  const body = toSitemapIndexXml(sitemapUrls);

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
