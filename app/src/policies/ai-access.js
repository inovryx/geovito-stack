'use strict';

const { getAiFlags } = require('../modules/ai/feature-flags');
const { writeAiAudit } = require('../modules/ai/ai-audit');
const { getClientIp, resolveActor } = require('../modules/domain-logging/context');
const { log } = require('../modules/domain-logging');

const isPrivateIpv4 = (ip) => {
  if (!ip || typeof ip !== 'string') return false;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('127.')) return true;

  const match = ip.match(/^172\.(\d+)\./);
  if (match) {
    const block = Number(match[1]);
    return Number.isFinite(block) && block >= 16 && block <= 31;
  }

  return false;
};

const isLocalAddress = (ip) => {
  const value = String(ip || '').trim().toLowerCase();
  if (!value) return false;
  if (value === '::1' || value === 'localhost' || value === '::ffff:127.0.0.1') return true;
  return isPrivateIpv4(value);
};

const detectAction = (pathValue) => {
  const pathname = String(pathValue || '');
  if (pathname.includes('/ai/diagnostics')) return 'diagnostics';
  if (pathname.includes('/ai/draft')) return 'draft';
  return 'unknown';
};

const hasPrivilegedRole = (user) => {
  if (!user || typeof user !== 'object') return false;

  const candidates = [
    user.role?.name,
    user.role?.type,
    ...(Array.isArray(user.roles) ? user.roles.flatMap((role) => [role?.name, role?.type]) : []),
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  return candidates.some((value) => value === 'admin' || value === 'editor');
};

const reject = async (ctx, reason, action) => {
  const requestId = ctx.state?.requestId || null;
  const actor = resolveActor(ctx);
  const ip = getClientIp(ctx);
  const requestPath = ctx.path || ctx.request?.path || ctx.request?.url || '';
  const requestMethod = ctx.method || ctx.request?.method || 'UNKNOWN';

  await writeAiAudit({
    request_id: requestId,
    actor,
    action: action || 'unknown',
    inputs_summary: {
      denied: true,
      path: requestPath,
      method: requestMethod,
      ip,
    },
    source_domains: ['ai'],
    output_hash: null,
    output_summary: reason,
    status: 'fail',
  });

  await log(
    'ai',
    'WARN',
    'ai.access.denied',
    reason,
    {
      path: requestPath,
      method: requestMethod,
      ip,
    },
    {
      request_id: requestId,
      actor,
    }
  );

  ctx.status = 403;
  ctx.body = {
    ok: false,
    error: reason,
    request_id: ctx.state?.requestId || null,
  };

  return false;
};

module.exports = async (ctx) => {
  const flags = getAiFlags();
  const requestPath = ctx.path || ctx.request?.path || ctx.request?.url || '';
  const action = detectAction(requestPath);

  if (!flags.enabled) {
    return reject(ctx, 'AI endpoints are disabled', action);
  }

  if (action === 'diagnostics' && !flags.diagnosticsEnabled) {
    return reject(ctx, 'AI diagnostics endpoint is disabled', action);
  }

  if (action === 'draft' && !flags.draftEnabled) {
    return reject(ctx, 'AI draft endpoint is disabled', action);
  }

  const clientIp = getClientIp(ctx);
  if (!isLocalAddress(clientIp)) {
    return reject(ctx, 'AI endpoints are local-only', action);
  }

  if (!ctx.state?.user || !hasPrivilegedRole(ctx.state.user)) {
    return reject(ctx, 'AI endpoints require admin/editor authentication', action);
  }

  return true;
};
