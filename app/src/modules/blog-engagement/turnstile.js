'use strict';

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

const isTokenValidationSuccess = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
  return payload.success === true;
};

const verifyToken = async (secretKey, token, remoteIp = '') => {
  const form = new URLSearchParams();
  form.set('secret', secretKey);
  form.set('response', token);
  if (remoteIp) {
    form.set('remoteip', remoteIp);
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const payload = await response.json().catch(() => null);
  return {
    ok: response.ok && isTokenValidationSuccess(payload),
    payload,
  };
};

const verifyGuestCommentTurnstile = async (ctx) => {
  const turnstileEnabled = parseBool(process.env.TURNSTILE_ENABLED, false);
  const guestTurnstileRequired = parseBool(process.env.BLOG_COMMENT_GUEST_TURNSTILE_REQUIRED, false);

  if (!turnstileEnabled || !guestTurnstileRequired) {
    return {
      enforced: false,
      ok: true,
      status: 200,
      name: 'TurnstileNotRequired',
      message: '',
    };
  }

  const secretKey = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secretKey) {
    return {
      enforced: true,
      ok: false,
      status: 503,
      name: 'TurnstileMisconfigured',
      message: 'Captcha verification is temporarily unavailable. Please try again later.',
    };
  }

  const token = readRequestToken(ctx);
  if (!token) {
    return {
      enforced: true,
      ok: false,
      status: 403,
      name: 'TurnstileTokenMissing',
      message: 'Captcha verification is required.',
    };
  }

  try {
    const remoteIp = clientIpFromContext(ctx);
    const verification = await verifyToken(secretKey, token, remoteIp);
    if (!verification.ok) {
      return {
        enforced: true,
        ok: false,
        status: 403,
        name: 'TurnstileVerificationFailed',
        message: 'Captcha verification failed. Please try again.',
        details: {
          error_codes: Array.isArray(verification.payload?.['error-codes'])
            ? verification.payload['error-codes']
            : [],
        },
      };
    }
  } catch (error) {
    return {
      enforced: true,
      ok: false,
      status: 503,
      name: 'TurnstileUnavailable',
      message: 'Captcha verification service is unavailable. Please try again later.',
      details: {
        error: error?.message || String(error),
      },
    };
  }

  return {
    enforced: true,
    ok: true,
    status: 200,
    name: 'TurnstileVerified',
    message: '',
  };
};

module.exports = {
  verifyGuestCommentTurnstile,
};
