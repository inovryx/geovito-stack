import type { APIRoute } from 'astro';
import { DEFAULT_LANGUAGE, isSupportedLanguage, SITE_UI_LANGUAGES, type SiteLanguage } from '../lib/languages';
import { normalizeCreatorUsername } from '../lib/ugcPostRules';

export const prerender = false;

const normalizeLanguage = (value: string | null | undefined): SiteLanguage | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (isSupportedLanguage(normalized)) return normalized;
  if (normalized.startsWith('zh')) return 'zh-cn';
  const primary = normalized.split('-')[0];
  if (isSupportedLanguage(primary)) return primary;
  return null;
};

const parseCookieLanguage = (cookieHeader: string | null): SiteLanguage | null => {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [rawName, ...rawValueParts] = pair.split('=');
    const name = String(rawName || '').trim();
    if (name !== 'geovito_ui_lang') continue;
    const rawValue = rawValueParts.join('=').trim();
    if (!rawValue) return null;
    try {
      return normalizeLanguage(decodeURIComponent(rawValue));
    } catch {
      return normalizeLanguage(rawValue);
    }
  }
  return null;
};

const parseAcceptLanguage = (header: string | null): SiteLanguage | null => {
  if (!header) return null;
  const tokens = header
    .split(',')
    .map((entry) => entry.split(';')[0]?.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const normalized = normalizeLanguage(token || '');
    if (normalized) return normalized;
  }
  return null;
};

const resolveTargetLanguage = (request: Request): SiteLanguage => {
  const cookieLanguage = parseCookieLanguage(request.headers.get('cookie'));
  if (cookieLanguage) return cookieLanguage;

  const acceptLanguage = parseAcceptLanguage(request.headers.get('accept-language'));
  if (acceptLanguage) return acceptLanguage;

  return DEFAULT_LANGUAGE;
};

const resolveMirrorLanguage = (request: Request): SiteLanguage => {
  const fallback = resolveTargetLanguage(request);
  return SITE_UI_LANGUAGES.includes(fallback) ? fallback : DEFAULT_LANGUAGE;
};

export const GET: APIRoute = ({ params, request, redirect }) => {
  const username = normalizeCreatorUsername(String(params.username || ''));
  if (!username) {
    return new Response('Not Found', { status: 404 });
  }

  const language = resolveMirrorLanguage(request);
  return redirect(`/${language}/@${username}/`, 307);
};
