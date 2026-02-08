'use strict';

const ROUTE_DOMAIN_RULES = Object.freeze([
  { prefix: '/api/atlas-places', domain: 'atlas' },
  { prefix: '/api/blog-posts', domain: 'blog' },
  { prefix: '/api/ui-pages', domain: 'ui' },
  { prefix: '/api/atlas-suggestions', domain: 'suggestions' },
  { prefix: '/api/gazetteer-entries', domain: 'import' },
  { prefix: '/api/import-batches', domain: 'import' },
  { prefix: '/api/search', domain: 'search' },
  { prefix: '/api/ai', domain: 'ai' },
  { prefix: '/admin', domain: 'ui' },
]);

const resolveDomainFromPath = (pathValue = '') => {
  const pathname = String(pathValue || '');
  for (const rule of ROUTE_DOMAIN_RULES) {
    if (pathname.startsWith(rule.prefix)) {
      return rule.domain;
    }
  }
  return 'ui';
};

const resolveActor = (ctx) => {
  if (ctx?.state?.aiSystemActor) return 'system';
  if (ctx?.state?.user?.id) return 'admin';
  if (String(ctx?.path || '').startsWith('/admin')) return 'admin';
  return 'public';
};

const resolveEntityRef = (ctx) => {
  const body = ctx?.request?.body || {};
  const payload =
    body && typeof body === 'object' && !Array.isArray(body) && body.data && typeof body.data === 'object'
      ? body.data
      : body;

  const directCandidates = [
    payload?.place_id,
    payload?.suggestion_id,
    payload?.post_id,
    payload?.target_place_id,
    payload?.target_place_ref,
    payload?.batch_id,
    payload?.record_id,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const routeId = ctx?.params?.id;
  if (typeof routeId === 'string' || typeof routeId === 'number') {
    return `id:${routeId}`;
  }

  return null;
};

const getClientIp = (ctx) => {
  const forwarded =
    ctx?.request?.get?.('x-forwarded-for') ||
    ctx?.request?.headers?.['x-forwarded-for'] ||
    ctx?.headers?.['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded)
      .split(',')[0]
      .trim();
  }
  return String(ctx?.ip || ctx?.request?.ip || ctx?.request?.socket?.remoteAddress || 'unknown');
};

module.exports = {
  resolveDomainFromPath,
  resolveActor,
  resolveEntityRef,
  getClientIp,
};
