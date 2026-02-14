import * as Sentry from '@sentry/browser';
import { BUILD_SHA } from '../buildInfo';
import { getConsent } from '../consent';
import type { ConsentState } from '../consent/types';

type Primitive = string | number | boolean | null;
type CaptureTags = Record<string, Primitive>;
type CaptureExtra = Record<string, unknown>;

export type CaptureContext = {
  tags?: CaptureTags;
  extra?: CaptureExtra;
  request?: {
    url?: string;
  };
};

export type InitSentryOptions = {
  consent?: ConsentState | null;
  release?: string;
  env?: string;
};

declare global {
  interface Window {
    __gvSentryEvents?: Array<Record<string, unknown>>;
    __gvCaptureException?: (error: unknown, ctx?: CaptureContext) => void;
  }
}

const SENTRY_ENABLED = import.meta.env.PUBLIC_SENTRY_ENABLED === 'true';
const SENTRY_DSN = String(import.meta.env.PUBLIC_SENTRY_DSN || '').trim();
const SENTRY_ENV = String(import.meta.env.PUBLIC_SENTRY_ENV || 'production').trim() || 'production';
const SENTRY_RELEASE = String(import.meta.env.PUBLIC_SENTRY_RELEASE || '').trim();
const TRACES_SAMPLE_RATE = Number(import.meta.env.PUBLIC_SENTRY_TRACES_SAMPLE_RATE || '0');
const USE_MOCK_TRANSPORT = import.meta.env.MODE === 'test';

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?\d[\d().\-\s]{7,}\d)\b/g;
const DISALLOWED_KEYS = new Set([
  'user',
  'userid',
  'email',
  'phone',
  'ip',
  'ipaddress',
  'token',
  'session',
  'cookie',
  'cookies',
  'password',
  'passwd',
  'jwt',
  'authorization',
  'auth',
]);

let initialized = false;

const canUseWindow = () => typeof window !== 'undefined';
const isRuntimeConfigured = () => SENTRY_ENABLED && Boolean(SENTRY_DSN);

const ensureEventBuffer = () => {
  if (!canUseWindow()) return null;
  if (!Array.isArray(window.__gvSentryEvents)) {
    window.__gvSentryEvents = [];
  }
  return window.__gvSentryEvents;
};

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const isAnalyticsConsentGranted = (consent?: ConsentState | null) => {
  const explicit = consent?.analytics;
  if (explicit === true) return true;
  if (explicit === false) return false;

  if (canUseWindow()) {
    const flag = document.documentElement.getAttribute('data-consent-analytics');
    if (flag === '1') return true;
    if (flag === '0') return false;
  }

  return getConsent()?.analytics === true;
};

const isCaptureAllowed = (consent?: ConsentState | null) => isRuntimeConfigured() && isAnalyticsConsentGranted(consent);

export const sanitizeUrl = (value: string) => {
  if (!value) return '';

  try {
    const base = canUseWindow() ? window.location.origin : 'https://www.geovito.com';
    const parsed = new URL(value, base);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    const withoutHash = value.split('#')[0] || '';
    const withoutQuery = withoutHash.split('?')[0] || '';
    return withoutQuery;
  }
};

export const redactPIIString = (value: string) => value.replace(EMAIL_PATTERN, '[redacted-email]').replace(PHONE_PATTERN, '[redacted-phone]');

const sanitizeUnknown = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return '[depth-trimmed]';
  if (typeof value === 'string') return redactPIIString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item, depth + 1));
  }
  if (!value || typeof value !== 'object') return undefined;

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(input)) {
    output[key] = sanitizeUnknown(nested, depth + 1);
  }
  return output;
};

const containsDisallowedKeys = (value: unknown, depth = 0): boolean => {
  if (!value || typeof value !== 'object' || depth > 5) return false;
  if (Array.isArray(value)) return value.some((item) => containsDisallowedKeys(item, depth + 1));

  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    if (DISALLOWED_KEYS.has(normalizeKey(key))) return true;
    return containsDisallowedKeys(nested, depth + 1);
  });
};

const pushBufferedEvent = (event: Sentry.ErrorEvent) => {
  const buffer = ensureEventBuffer();
  if (!buffer) return;

  try {
    const cloned = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
    const request = cloned.request as Record<string, unknown> | undefined;
    const contexts = cloned.contexts as Record<string, unknown> | undefined;
    const contextRequest = contexts?.request as Record<string, unknown> | undefined;

    if ((!request || typeof request.url !== 'string') && contextRequest && typeof contextRequest.url === 'string') {
      cloned.request = { url: contextRequest.url };
    }

    buffer.push(cloned);
  } catch {
    buffer.push({
      message: event.message || event.exception?.values?.[0]?.value || 'unknown-error',
      request: event.request
        ? { url: event.request.url }
        : (event.contexts as Record<string, unknown> | undefined)?.request
          ? {
              url: ((event.contexts as Record<string, unknown>).request as Record<string, unknown>).url,
            }
          : undefined,
      level: event.level || 'error',
      tags: event.tags || {},
      extra: event.extra || {},
    });
  }
};

const sanitizeEvent = (event: Sentry.ErrorEvent) => {
  const next = event;

  delete next.user;

  if (next.request) {
    if (typeof next.request.url === 'string') {
      next.request.url = sanitizeUrl(next.request.url);
    }
    delete next.request.headers;
    delete next.request.cookies;
    delete next.request.query_string;
  }

  if (typeof next.message === 'string') {
    next.message = redactPIIString(next.message);
  }

  if (Array.isArray(next.exception?.values)) {
    next.exception.values = next.exception.values.map((item) => ({
      ...item,
      value: typeof item.value === 'string' ? redactPIIString(item.value) : item.value,
    }));
  }

  if (Array.isArray(next.breadcrumbs)) {
    next.breadcrumbs = next.breadcrumbs.map((crumb) => {
      const sanitized = { ...crumb };
      if (sanitized.data && typeof sanitized.data === 'object') {
        const data = { ...(sanitized.data as Record<string, unknown>) };
        if (typeof data.url === 'string') {
          data.url = sanitizeUrl(data.url);
        }
        sanitized.data = sanitizeUnknown(data) as Record<string, unknown>;
      }
      if (typeof sanitized.message === 'string') {
        sanitized.message = redactPIIString(sanitized.message);
      }
      return sanitized;
    });
  }

  if (next.contexts && typeof next.contexts === 'object') {
    const contexts = next.contexts as Record<string, unknown>;
    const requestContext = contexts.request;
    if (requestContext && typeof requestContext === 'object') {
      const scopedRequest = requestContext as Record<string, unknown>;
      if (typeof scopedRequest.url === 'string') {
        scopedRequest.url = sanitizeUrl(scopedRequest.url);
      }
      contexts.request = scopedRequest;
    }
    next.contexts = sanitizeUnknown(contexts) as Record<string, unknown>;
  }

  if (next.extra && typeof next.extra === 'object') {
    next.extra = sanitizeUnknown(next.extra) as Record<string, unknown>;
  }

  if (next.tags && typeof next.tags === 'object') {
    next.tags = sanitizeUnknown(next.tags) as Record<string, Primitive>;
  }

  if (containsDisallowedKeys(next)) {
    return null;
  }

  pushBufferedEvent(next);
  return next;
};

const normalizeContext = (ctx: CaptureContext = {}) => {
  const tags = (sanitizeUnknown(ctx.tags || {}) || {}) as Record<string, Primitive>;
  const extra = (sanitizeUnknown(ctx.extra || {}) || {}) as Record<string, unknown>;
  const requestUrl = typeof ctx.request?.url === 'string' ? sanitizeUrl(ctx.request.url) : undefined;
  return {
    tags,
    extra,
    requestUrl,
  };
};

export const initSentry = ({ consent = null, release, env }: InitSentryOptions = {}): void => {
  if (!canUseWindow()) return;
  if (!isCaptureAllowed(consent)) return;
  if (initialized) return;

  const effectiveRelease = (release || SENTRY_RELEASE || BUILD_SHA || 'dev').trim() || 'dev';
  const effectiveEnv = (env || SENTRY_ENV || 'production').trim() || 'production';
  const tracesSampleRate = Number.isFinite(TRACES_SAMPLE_RATE) && TRACES_SAMPLE_RATE >= 0 ? TRACES_SAMPLE_RATE : 0;

  try {
    const options: Sentry.BrowserOptions = {
      dsn: SENTRY_DSN,
      environment: effectiveEnv,
      release: effectiveRelease,
      tracesSampleRate,
      sendDefaultPii: false,
      defaultIntegrations: false,
      beforeSend: sanitizeEvent,
    };

    if (USE_MOCK_TRANSPORT) {
      options.transport = (() =>
        ({
          send: async () => ({ status: 'success' as const }),
          flush: async () => true,
        })) as unknown as Sentry.BrowserOptions['transport'];
    }

    Sentry.init(options);
    initialized = true;
  } catch {
    initialized = false;
  }
};

export const captureException = (error: unknown, ctx: CaptureContext = {}): void => {
  if (!canUseWindow()) return;
  if (!isCaptureAllowed()) return;

  if (!initialized) {
    initSentry({ consent: getConsent() || null });
  }
  if (!initialized) return;

  const { tags, extra, requestUrl } = normalizeContext(ctx);

  Sentry.withScope((scope) => {
    if (Object.keys(tags).length) {
      Object.entries(tags).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        scope.setTag(key, String(value));
      });
    }

    if (Object.keys(extra).length) {
      Object.entries(extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    if (requestUrl) {
      scope.setContext('request', { url: requestUrl });
    }

    Sentry.captureException(error);
  });
};

export const isSentryRuntimeEnabled = () => isRuntimeConfigured();
