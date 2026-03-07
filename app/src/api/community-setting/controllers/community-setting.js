'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { authenticateFromBearer } = require('../../../modules/blog-engagement/auth');
const {
  ALLOWED_SETTINGS_KEYS,
  getCommunitySettings,
  sanitizePartialSettings,
  upsertCommunitySettings,
} = require('../../../modules/community-settings');
const { resolveOwnerEmailHints, isOwnerEmail } = require('../../../modules/security/owner-emails');
const { resolveActorFromIdentity, writeAuditLog } = require('../../../modules/security/audit-log');

const USER_UID = 'plugin::users-permissions.user';
const OWNER_EMAIL_HINTS = resolveOwnerEmailHints(process.env);

const resolveIdentity = async (strapi, ctx) => {
  const baseUser = ctx.state?.user?.id ? ctx.state.user : await authenticateFromBearer(strapi, ctx);
  if (!baseUser?.id) return null;

  const user = await strapi.entityService.findOne(USER_UID, Number(baseUser.id), {
    fields: ['id', 'email', 'username', 'blocked'],
    populate: {
      role: {
        fields: ['id', 'type', 'name'],
      },
    },
  });

  if (!user || user.blocked === true) return null;

  const roleRaw = String(user?.role?.type || user?.role?.name || '')
    .trim()
    .toLowerCase();
  const isAdmin = roleRaw.includes('super') || roleRaw.includes('admin');
  const isEditor = roleRaw.includes('editor');
  const isOwner = isOwnerEmail(user.email, OWNER_EMAIL_HINTS);

  return {
    user,
    canRead: isAdmin || isEditor || isOwner,
    canWrite: isAdmin || isOwner,
  };
};

const resolveUpdatePayload = (requestBody = {}) => {
  if (requestBody && typeof requestBody === 'object' && !Array.isArray(requestBody)) {
    if (requestBody.data && typeof requestBody.data === 'object' && !Array.isArray(requestBody.data)) {
      return requestBody.data;
    }
    return requestBody;
  }
  return null;
};

module.exports = createCoreController('api::community-setting.community-setting', ({ strapi }) => ({
  async effective(ctx) {
    const identity = await resolveIdentity(strapi, ctx);
    if (!identity?.canRead) {
      return ctx.forbidden('Moderator/Admin access required.');
    }

    const settings = await getCommunitySettings(strapi, { refresh: true });
    ctx.body = {
      data: settings,
    };
  },

  async updateEffective(ctx) {
    const identity = await resolveIdentity(strapi, ctx);
    if (!identity?.canWrite) {
      return ctx.forbidden('Admin/Owner access required.');
    }

    const payload = resolveUpdatePayload(ctx.request.body);
    if (!payload) {
      return ctx.badRequest('Settings payload is required.');
    }

    const sanitized = sanitizePartialSettings(payload);
    const providedKeys = Object.keys(payload);
    const unknownKeys = providedKeys.filter((key) => !ALLOWED_SETTINGS_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      return ctx.badRequest(`Unknown community setting key(s): ${unknownKeys.join(', ')}`);
    }

    if (Object.keys(sanitized).length === 0) {
      return ctx.badRequest('No valid community setting fields provided.');
    }

    const settings = await upsertCommunitySettings(strapi, sanitized);
    await writeAuditLog(strapi, {
      actor: resolveActorFromIdentity({
        user: identity.user,
        roleRaw: identity.user?.role?.type || identity.user?.role?.name || '',
      }),
      requestId: ctx.state?.requestId || null,
      action: 'community.settings.update',
      targetType: 'community-setting',
      targetRef: 'effective',
      payload: {
        updated_keys: Object.keys(sanitized),
      },
    });
    ctx.body = {
      data: settings,
      meta: {
        updated_by: Number(identity.user.id),
      },
    };
  },
}));
