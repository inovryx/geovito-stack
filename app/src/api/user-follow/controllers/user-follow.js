'use strict';

const crypto = require('crypto');
const { createCoreController } = require('@strapi/strapi').factories;
const { authenticateFromBearer } = require('../../../modules/blog-engagement/auth');
const { sanitizeText } = require('../../../modules/suggestions/sanitize');
const { getCommunitySettings } = require('../../../modules/community-settings');

const UID = 'api::user-follow.user-follow';
const USER_UID = 'plugin::users-permissions.user';
const TARGET_TYPE_SET = new Set(['user', 'place']);
const STATUS_SET = new Set(['active', 'muted']);
const ACTION_SET = new Set(['toggle', 'follow', 'unfollow']);

const parseIntValue = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const FOLLOW_MAX_PER_USER = parseIntValue(process.env.FOLLOW_MAX_PER_USER, 2500, 1, 50000);

const normalizeLower = (value) => String(value || '').trim().toLowerCase();
const normalizeTargetRef = (value) => normalizeLower(sanitizeText(value, 160));

const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parsePayload = (ctx) => {
  const payload = ctx.request?.body?.data || ctx.request?.body || {};
  return payload && typeof payload === 'object' ? payload : {};
};

const makeFollowId = () => `follow-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

const resolveAuthUser = async (strapi, ctx) => {
  const baseUser = ctx.state?.user?.id ? ctx.state.user : await authenticateFromBearer(strapi, ctx);
  const userId = toPositiveInt(baseUser?.id);
  if (!userId) return null;

  const user = await strapi.entityService.findOne(USER_UID, userId, {
    fields: ['id', 'email', 'username', 'blocked'],
  });
  if (!user || user.blocked === true) return null;
  return user;
};

const toPublic = (entry) => {
  if (!entry) return null;
  return {
    follow_id: entry.follow_id,
    target_type: entry.target_type,
    target_ref: entry.target_ref,
    status: entry.status,
    last_toggled_at: entry.last_toggled_at || null,
    created_at: entry.createdAt || null,
    updated_at: entry.updatedAt || null,
  };
};

const findFollow = async (strapi, ownerUserId, targetType, targetRef) => {
  const rows = await strapi.entityService.findMany(UID, {
    publicationState: 'preview',
    filters: {
      owner_user_id: Number(ownerUserId),
      target_type: targetType,
      target_ref: targetRef,
    },
    fields: ['id', 'follow_id', 'target_type', 'target_ref', 'status', 'last_toggled_at', 'createdAt', 'updatedAt'],
    limit: 1,
  });
  return rows[0] || null;
};

const isFollowEnabled = async (strapi) => {
  const settings = await getCommunitySettings(strapi, { refresh: true });
  return settings?.follow_system_enabled === true;
};

module.exports = createCoreController(UID, ({ strapi }) => ({
  async toggleMe(ctx) {
    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const followEnabled = await isFollowEnabled(strapi);
    if (!followEnabled) {
      return ctx.forbidden('Follow system is disabled.');
    }

    const payload = parsePayload(ctx);
    const targetType = normalizeLower(payload.target_type);
    const targetRef = normalizeTargetRef(payload.target_ref);
    const action = normalizeLower(payload.action || 'toggle');

    if (!TARGET_TYPE_SET.has(targetType)) {
      return ctx.badRequest('target_type is invalid');
    }
    if (!targetRef) {
      return ctx.badRequest('target_ref is required');
    }
    if (!ACTION_SET.has(action)) {
      return ctx.badRequest('action is invalid');
    }

    if (targetType === 'user') {
      const ownId = String(user.id);
      const ownUsername = normalizeLower(user.username);
      if (targetRef === ownId || (ownUsername && targetRef === ownUsername)) {
        return ctx.badRequest('You cannot follow yourself.');
      }
    }

    const existing = await findFollow(strapi, user.id, targetType, targetRef);
    const nowIso = new Date().toISOString();
    const requestIp = ctx.request.ip || ctx.ip || 'unknown';

    if (action === 'unfollow' || (action === 'toggle' && existing?.id)) {
      if (existing?.id) {
        await strapi.entityService.delete(UID, Number(existing.id));
      }
      ctx.body = {
        data: {
          target_type: targetType,
          target_ref: targetRef,
          following: false,
          follow_id: null,
          last_toggled_at: nowIso,
        },
      };
      return;
    }

    if (!existing?.id) {
      const currentCount = await strapi.db.query(UID).count({
        where: {
          owner_user_id: Number(user.id),
        },
      });
      if (currentCount >= FOLLOW_MAX_PER_USER) {
        return ctx.badRequest(`Follow limit reached (max=${FOLLOW_MAX_PER_USER}).`);
      }

      const created = await strapi.entityService.create(UID, {
        data: {
          follow_id: makeFollowId(),
          owner_user: Number(user.id),
          owner_user_id: Number(user.id),
          target_type: targetType,
          target_ref: targetRef,
          status: 'active',
          created_from_ip: requestIp,
          last_toggled_at: nowIso,
        },
      });

      ctx.status = 201;
      ctx.body = {
        data: {
          ...toPublic(created),
          following: true,
        },
      };
      return;
    }

    const updated = await strapi.entityService.update(UID, Number(existing.id), {
      data: {
        status: 'active',
        last_toggled_at: nowIso,
      },
      fields: ['follow_id', 'target_type', 'target_ref', 'status', 'last_toggled_at', 'createdAt', 'updatedAt'],
    });

    ctx.body = {
      data: {
        ...toPublic(updated),
        following: true,
      },
    };
  },

  async myList(ctx) {
    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const targetType = normalizeLower(ctx.query?.target_type);
    const status = normalizeLower(ctx.query?.status);
    const limit = parseIntValue(ctx.query?.limit, 100, 1, 500);

    const filters = {
      owner_user_id: Number(user.id),
    };
    if (TARGET_TYPE_SET.has(targetType)) {
      filters.target_type = targetType;
    }
    if (STATUS_SET.has(status)) {
      filters.status = status;
    }

    const rows = await strapi.entityService.findMany(UID, {
      publicationState: 'preview',
      filters,
      fields: ['follow_id', 'target_type', 'target_ref', 'status', 'last_toggled_at', 'createdAt', 'updatedAt'],
      sort: ['createdAt:desc'],
      limit,
    });

    ctx.body = {
      data: {
        follow_system_enabled: await isFollowEnabled(strapi),
        items: Array.isArray(rows) ? rows.map(toPublic) : [],
      },
    };
  },
}));
