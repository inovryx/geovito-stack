'use strict';

const { log } = require('../modules/domain-logging');

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const readRequestToken = (ctx) => {
  const headerToken =
    ctx.request.get('x-turnstile-token') || ctx.request.get('cf-turnstile-response') || '';
  if (headerToken && headerToken.trim()) return headerToken.trim();

  const body = ctx.request.body;
  if (!body || typeof body !== 'object') return '';

  const responseToken = body['cf-turnstile-response'];
  if (typeof responseToken === 'string' && responseToken.trim()) return responseToken.trim();

  const customToken = body.turnstileToken;
  if (typeof customToken === 'string' && customToken.trim()) return customToken.trim();

  return '';
};

const clientIpFromContext = (ctx) => {
  const forwarded = ctx.request.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded
      .split(',')
      .map((value) => value.trim())
      .find(Boolean);
    if (first) return first;
  }

  return ctx.request.ip || ctx.ip || '';
};

const routeKeyForPath = (path, method) => {
  if (method === 'POST' && path === '/api/auth/local/register') return 'register';
  if (method === 'POST' && path === '/api/auth/local') return 'login';
  if (method === 'POST' && path === '/api/auth/forgot-password') return 'forgot_password';
  if (method === 'POST' && path === '/api/auth/reset-password') return 'reset_password';
  return null;
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

const isTokenValidationSuccess = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
  return payload.success === true;
};

module.exports = () => {
  const turnstileEnabled = parseBool(process.env.TURNSTILE_ENABLED, false);
  const secretKey = String(process.env.TURNSTILE_SECRET_KEY || '').trim();

  return async (ctx, next) => {
    const method = String(ctx.method || 'GET').toUpperCase();
    const path = String(ctx.path || '');
    const routeKey = routeKeyForPath(path, method);

    if (!routeKey || !turnstileEnabled) {
      await next();
      return;
    }

    if (!secretKey) {
      await deny(
        ctx,
        503,
        'TurnstileMisconfigured',
        'Captcha verification is temporarily unavailable. Please try again later.',
        'turnstile.guard.misconfigured',
        { method, path, route: routeKey }
      );
      return;
    }

    const token = readRequestToken(ctx);
    if (!token) {
      await deny(
        ctx,
        403,
        'TurnstileTokenMissing',
        'Captcha verification is required.',
        'turnstile.guard.token_missing',
        { method, path, route: routeKey }
      );
      return;
    }

    const form = new URLSearchParams();
    form.set('secret', secretKey);
    form.set('response', token);

    const ip = clientIpFromContext(ctx);
    if (ip) {
      form.set('remoteip', ip);
    }

    let verifyResponse;
    let verifyPayload;
    try {
      verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      verifyPayload = await verifyResponse.json().catch(() => null);
    } catch (error) {
      await deny(
        ctx,
        503,
        'TurnstileUnavailable',
        'Captcha verification service is unavailable. Please try again later.',
        'turnstile.guard.verify_error',
        { method, path, route: routeKey, error: error?.message || String(error) }
      );
      return;
    }

    if (!verifyResponse?.ok || !isTokenValidationSuccess(verifyPayload)) {
      await deny(
        ctx,
        403,
        'TurnstileVerificationFailed',
        'Captcha verification failed. Please try again.',
        'turnstile.guard.verify_failed',
        {
          method,
          path,
          route: routeKey,
          challenge_ts: verifyPayload?.challenge_ts || null,
          error_codes: Array.isArray(verifyPayload?.['error-codes']) ? verifyPayload['error-codes'] : [],
        }
      );
      return;
    }

    await next();
  };
};
