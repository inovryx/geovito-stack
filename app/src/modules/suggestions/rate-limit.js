'use strict';

const { PUBLIC_LIMITS } = require('./constants');

const buckets = new Map();

const getClientIp = (ctx) => {
  const forwarded = ctx.request.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return ctx.ip || 'unknown';
};

const isLimited = (key) => {
  const now = Date.now();
  const from = now - PUBLIC_LIMITS.RATE_WINDOW_MS;

  const existing = buckets.get(key) || [];
  const recent = existing.filter((timestamp) => timestamp >= from);

  if (recent.length >= PUBLIC_LIMITS.RATE_MAX_REQUESTS) {
    buckets.set(key, recent);
    return true;
  }

  recent.push(now);
  buckets.set(key, recent);
  return false;
};

module.exports = {
  getClientIp,
  isLimited,
};
