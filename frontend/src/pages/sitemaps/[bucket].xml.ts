import { buildAtlasSitemapChunks, toUrlSetXml } from '../../lib/sitemap';

export const prerender = true;

type ChunkProps = {
  urls: string[];
};

export async function getStaticPaths() {
  const chunks = await buildAtlasSitemapChunks();

  return chunks.map((chunk) => ({
    params: { bucket: chunk.bucket },
    props: {
      urls: chunk.urls,
    },
  }));
}

export async function GET({ props }: { props: ChunkProps }) {
  const urls = Array.isArray(props?.urls) ? props.urls : [];
  const body = toUrlSetXml(urls);

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
