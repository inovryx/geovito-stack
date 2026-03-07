import type { APIRoute } from 'astro';

const normalizeBaseUrl = (value: string | undefined, site: URL | undefined): string => {
  const raw = String(value || site?.origin || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
};

const isEnabled = (value: string | undefined): boolean => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

export const GET: APIRoute = ({ site, request }) => {
  const requestHost = (() => {
    try {
      return new URL(request.url).hostname.toLowerCase();
    } catch (_) {
      return '';
    }
  })();

  const hostLockdownEnabled = requestHost.includes('staging.');
  const envLockdownEnabled = isEnabled(
    (import.meta.env.PUBLIC_SITE_LOCKDOWN_ENABLED as string | undefined) ||
      (process.env.PUBLIC_SITE_LOCKDOWN_ENABLED as string | undefined)
  );
  const lockdownEnabled = envLockdownEnabled || hostLockdownEnabled;
  const baseUrl = normalizeBaseUrl(
    (import.meta.env.PUBLIC_SITE_URL as string | undefined) || process.env.PUBLIC_SITE_URL,
    site
  );

  const lines = lockdownEnabled
    ? ['User-agent: *', 'Disallow: /']
    : ['User-agent: *', 'Allow: /', baseUrl ? `Sitemap: ${baseUrl}/sitemap.xml` : ''];

  const body = `${lines.filter(Boolean).join('\n')}\n`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
};
