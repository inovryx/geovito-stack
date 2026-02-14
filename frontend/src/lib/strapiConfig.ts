export type StrapiEnv = {
  STRAPI_URL?: string;
  PUBLIC_STRAPI_URL?: string;
  CF_PAGES?: string;
  NODE_ENV?: string;
  ALLOW_LOCALHOST_STRAPI?: string;
};

const DEFAULT_STRAPI_URL = 'http://127.0.0.1:1337';
const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const isTruthy = (value?: string) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const toHostname = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  } catch {
    return '';
  }
};

export const isProductionLikeStrapiEnv = (env: StrapiEnv) =>
  isTruthy(env.CF_PAGES) || String(env.NODE_ENV || '').trim().toLowerCase() === 'production';

export const isLocalhostStrapiUrl = (url: string) => LOCALHOST_HOSTNAMES.has(toHostname(url));

export const resolveStrapiBaseUrl = (env: StrapiEnv) => {
  const configured =
    (env.STRAPI_URL && env.STRAPI_URL.trim()) ||
    (env.PUBLIC_STRAPI_URL && env.PUBLIC_STRAPI_URL.trim()) ||
    DEFAULT_STRAPI_URL;

  const resolved = configured.replace(/\/$/, '');
  const allowLocalhost = isTruthy(env.ALLOW_LOCALHOST_STRAPI);

  if (isProductionLikeStrapiEnv(env) && !allowLocalhost && isLocalhostStrapiUrl(resolved)) {
    throw new Error(
      '[STRAPI_URL_GUARD] Refusing localhost Strapi URL in production-like mode. ' +
        `Resolved URL="${resolved}". ` +
        'Set STRAPI_URL (and optionally PUBLIC_STRAPI_URL) to your reachable Strapi API origin, ' +
        'for example https://cms.example.com. ' +
        'For intentional local smoke only, set ALLOW_LOCALHOST_STRAPI=true.'
    );
  }

  return resolved;
};
