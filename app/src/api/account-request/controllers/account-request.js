'use strict';

const crypto = require('crypto');
const { createCoreController } = require('@strapi/strapi').factories;
const { authenticateFromBearer } = require('../../../modules/blog-engagement/auth');
const { sanitizeText } = require('../../../modules/suggestions/sanitize');
const { resolveOwnerEmailHints, isOwnerEmail } = require('../../../modules/security/owner-emails');
const { resolveActorFromIdentity, writeAuditLog } = require('../../../modules/security/audit-log');

const UID = 'api::account-request.account-request';
const USER_UID = 'plugin::users-permissions.user';
const OWNER_EMAIL_HINTS = resolveOwnerEmailHints(process.env);

const REQUEST_TYPE_SET = new Set(['deactivate', 'delete']);
const REQUEST_STATUS_SET = new Set(['new', 'approved', 'rejected', 'completed']);

const parsePayload = (ctx) => {
  const payload = ctx.request?.body?.data || ctx.request?.body || {};
  return payload && typeof payload === 'object' ? payload : {};
};

const parseIntValue = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const normalizeLower = (value) => String(value || '').trim().toLowerCase();
const makeRequestId = () => `acct-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const resolveAuthUser = async (strapi, ctx) => {
  const baseUser = ctx.state?.user?.id ? ctx.state.user : await authenticateFromBearer(strapi, ctx);
  const userId = toPositiveInt(baseUser?.id);
  if (!userId) return null;

  const user = await strapi.entityService.findOne(USER_UID, userId, {
    fields: ['id', 'email', 'username', 'blocked'],
    populate: {
      role: {
        fields: ['id', 'type', 'name'],
      },
    },
  });
  if (!user || user.blocked === true) return null;
  return user;
};

const resolveModerationIdentity = async (strapi, ctx) => {
  const user = await resolveAuthUser(strapi, ctx);
  if (!user) return null;

  const roleRaw = normalizeLower(user?.role?.type || user?.role?.name || '');
  const isAdmin = roleRaw.includes('super') || roleRaw.includes('admin');
  const isEditor = isAdmin || roleRaw.includes('editor');
  const isOwner = isOwnerEmail(user.email, OWNER_EMAIL_HINTS);
  return {
    user,
    canModerate: isAdmin || isEditor || isOwner,
  };
};

const toPublic = (entry) => {
  if (!entry) return null;
  return {
    request_id: entry.request_id,
    request_type: entry.request_type,
    status: entry.status,
    reason: entry.reason || null,
    resolution_note: entry.resolution_note || null,
    resolved_by: entry.resolved_by || null,
    resolved_at: entry.resolved_at || null,
    created_at: entry.createdAt || null,
    updated_at: entry.updatedAt || null,
  };
};

module.exports = createCoreController(UID, ({ strapi }) => ({
  async submitMe(ctx) {
    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const payload = parsePayload(ctx);
    const requestType = normalizeLower(payload.request_type);
    const reason = sanitizeText(payload.reason, 2000) || null;
    if (!REQUEST_TYPE_SET.has(requestType)) {
      return ctx.badRequest('request_type is invalid');
    }

    const existingRows = await strapi.entityService.findMany(UID, {
      publicationState: 'preview',
      filters: {
        owner_user_id: Number(user.id),
        request_type: requestType,
        status: {
          $in: ['new', 'approved'],
        },
      },
      fields: ['id'],
      limit: 1,
    });
    if (existingRows[0]?.id) {
      return ctx.badRequest('An active request already exists for this type.');
    }

    const created = await strapi.entityService.create(UID, {
      data: {
        request_id: makeRequestId(),
        owner_user: Number(user.id),
        owner_user_id: Number(user.id),
        request_type: requestType,
        status: 'new',
        reason,
      },
    });

    ctx.status = 201;
    ctx.body = {
      data: toPublic(created),
    };
  },

  async myList(ctx) {
    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const limit = parseIntValue(ctx.query?.limit, 50, 1, 300);
    const rows = await strapi.entityService.findMany(UID, {
      publicationState: 'preview',
      filters: {
        owner_user_id: Number(user.id),
      },
      fields: ['request_id', 'request_type', 'status', 'reason', 'resolution_note', 'resolved_by', 'resolved_at', 'createdAt', 'updatedAt'],
      sort: ['createdAt:desc'],
      limit,
    });

    ctx.body = {
      data: Array.isArray(rows) ? rows.map(toPublic) : [],
    };
  },

  async moderationList(ctx) {
    const identity = await resolveModerationIdentity(strapi, ctx);
    if (!identity?.canModerate) return ctx.forbidden('Moderation access denied.');

    const status = normalizeLower(ctx.query?.status);
    const limit = parseIntValue(ctx.query?.limit, 80, 1, 500);
    const filters = {};
    if (REQUEST_STATUS_SET.has(status)) {
      filters.status = status;
    }

    const rows = await strapi.entityService.findMany(UID, {
      publicationState: 'preview',
      filters,
      fields: ['request_id', 'request_type', 'status', 'reason', 'resolution_note', 'resolved_by', 'resolved_at', 'createdAt', 'updatedAt'],
      sort: ['createdAt:asc'],
      limit,
    });

    ctx.body = {
      data: Array.isArray(rows) ? rows.map(toPublic) : [],
    };
  },

  async moderationSet(ctx) {
    const identity = await resolveModerationIdentity(strapi, ctx);
    if (!identity?.canModerate) return ctx.forbidden('Moderation access denied.');

    const payload = parsePayload(ctx);
    const requestId = sanitizeText(payload.request_id, 120);
    const nextStatus = normalizeLower(payload.next_status);
    const resolutionNote = sanitizeText(payload.resolution_note, 2000) || null;

    if (!requestId) return ctx.badRequest('request_id is required');
    if (!['approved', 'rejected', 'completed'].includes(nextStatus)) {
      return ctx.badRequest('next_status is invalid');
    }

    const existingRows = await strapi.entityService.findMany(UID, {
      publicationState: 'preview',
      filters: {
        request_id: requestId,
      },
      fields: ['id', 'status'],
      limit: 1,
    });
    const existing = existingRows[0] || null;
    if (!existing?.id) return ctx.notFound('Request not found');

    const updated = await strapi.entityService.update(UID, Number(existing.id), {
      data: {
        status: nextStatus,
        resolution_note: resolutionNote,
        resolved_by: Number(identity.user.id),
        resolved_at: new Date().toISOString(),
      },
      fields: ['request_id', 'request_type', 'status', 'reason', 'resolution_note', 'resolved_by', 'resolved_at', 'createdAt', 'updatedAt'],
    });

    await writeAuditLog(strapi, {
      actor: resolveActorFromIdentity({
        user: identity.user,
        roleRaw: identity.user?.role?.type || identity.user?.role?.name || '',
      }),
      action: 'moderation.account_request.set',
      targetType: 'account-request',
      targetRef: updated.request_id,
      payload: {
        from_status: existing.status,
        to_status: updated.status,
      },
    });

    ctx.body = {
      data: toPublic(updated),
    };
  },
}));
