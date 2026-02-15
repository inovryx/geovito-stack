'use strict';

const { log } = require('../modules/domain-logging');

const RATE_LIMIT_STORE = new Map();
let lastSweepAt = 0;

const nowMs = () => Date.now();

const clientIpFromContext = (ctx) => {
  const forwarded = ctx.request.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded
      .split(',')
      .map((value) => value.trim())
      .find(Boolean);
    if (first) return first;
  }

  return ctx.request.ip || ctx.ip || 'unknown';
};

const routeKeyForPath = (path, method) => {
  if (method === 'POST' && path === '/api/auth/local/register') return 'register';
  if (method === 'POST' && path === '/api/auth/local') return 'login';
  if (path === '/api/connect/google' || path.startsWith('/api/connect/google/')) return 'google';
  if (path === '/api/connect/facebook' || path.startsWith('/api/connect/facebook/')) return 'facebook';
  return null;
};

const sweepRateLimitStore = (currentMs) => {
  if (currentMs - lastSweepAt < 10 * 60 * 1000) return;
  lastSweepAt = currentMs;

  for (const [key, value] of RATE_LIMIT_STORE.entries()) {
    if (currentMs > value.resetAt + 60 * 1000) {
      RATE_LIMIT_STORE.delete(key);
    }
  }
};

const consumeRateLimitToken = (key, max, windowMs, currentMs) => {
  sweepRateLimitStore(currentMs);

  const existing = RATE_LIMIT_STORE.get(key);
  if (!existing || currentMs > existing.resetAt) {
    RATE_LIMIT_STORE.set(key, {
      count: 1,
      resetAt: currentMs + windowMs,
    });
    return true;
  }

  if (existing.count >= max) return false;
  existing.count += 1;
  return true;
};

const deny = async (ctx, status, name, message, event, meta = {}) => {
  await log('ops', status >= 500 ? 'ERROR' : 'WARN', event, message, meta, {
    request_id: ctx.state.requestId || null,
    actor: ctx.state.user ? 'authenticated' : 'public',
  });

  ctx.status = status;
  ctx.body = {
    data: null,
    error: {
      status,
      name,
      message,
      details: {},
    },
  };
};

const parseBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const parseIntEnv = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = () => {
  const registerEnabled = parseBool(process.env.AUTH_LOCAL_REGISTER_ENABLED, true);
  const googleEnabled = parseBool(process.env.AUTH_GOOGLE_ENABLED, false);
  const facebookEnabled = parseBool(process.env.AUTH_FACEBOOK_ENABLED, false);
  const windowMs = Math.max(1000, parseIntEnv(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 60000));
  const maxRequests = Math.max(1, parseIntEnv(process.env.AUTH_RATE_LIMIT_MAX, 20));

  return async (ctx, next) => {
    const method = String(ctx.method || 'GET').toUpperCase();
    const path = String(ctx.path || '');
    const routeKey = routeKeyForPath(path, method);
    if (!routeKey) {
      await next();
      return;
    }

    if (routeKey === 'register' && !registerEnabled) {
      await deny(
        ctx,
        403,
        'AuthRegistrationDisabled',
        'Public registration is disabled in this environment.',
        'auth.guard.registration.disabled',
        { method, path, route: routeKey }
      );
      return;
    }

    if (routeKey === 'google' && !googleEnabled) {
      await deny(
        ctx,
        403,
        'AuthProviderDisabled',
        'Google auth is disabled in this environment.',
        'auth.guard.provider.disabled',
        { method, path, route: routeKey, provider: 'google' }
      );
      return;
    }

    if (routeKey === 'facebook' && !facebookEnabled) {
      await deny(
        ctx,
        403,
        'AuthProviderDisabled',
        'Facebook auth is disabled in this environment.',
        'auth.guard.provider.disabled',
        { method, path, route: routeKey, provider: 'facebook' }
      );
      return;
    }

    const ip = clientIpFromContext(ctx);
    const limiterKey = `${routeKey}:${ip}`;
    const accepted = consumeRateLimitToken(limiterKey, maxRequests, windowMs, nowMs());

    if (!accepted) {
      await deny(
        ctx,
        429,
        'AuthRateLimitExceeded',
        'Too many authentication requests. Please try again later.',
        'auth.guard.rate_limited',
        { method, path, route: routeKey, ip, max_requests: maxRequests, window_ms: windowMs }
      );
      return;
    }

    await next();
  };
};
