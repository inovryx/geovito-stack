'use strict';

const buckets = new Map();

const getClientIp = (ctx) => {
  const forwarded = ctx.request.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded
      .split(',')
      .map((value) => value.trim())
      .find(Boolean);
    if (first) return first;
  }

  return ctx.ip || ctx.request.ip || 'unknown';
};

const isLimited = (key, windowMs, maxRequests) => {
  const now = Date.now();
  const from = now - windowMs;

  const existing = buckets.get(key) || [];
  const recent = existing.filter((timestamp) => timestamp >= from);

  if (recent.length >= maxRequests) {
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
