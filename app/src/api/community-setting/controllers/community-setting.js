'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { authenticateFromBearer } = require('../../../modules/blog-engagement/auth');
const { getCommunitySettings } = require('../../../modules/community-settings');

const USER_UID = 'plugin::users-permissions.user';
const OWNER_EMAIL_HINT = String(process.env.OWNER_EMAIL || process.env.PUBLIC_OWNER_EMAIL || '')
  .trim()
  .toLowerCase();

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
  const isOwner = Boolean(OWNER_EMAIL_HINT) && String(user.email || '').trim().toLowerCase() === OWNER_EMAIL_HINT;

  return {
    user,
    canAccess: isAdmin || isEditor || isOwner,
  };
};

module.exports = createCoreController('api::community-setting.community-setting', ({ strapi }) => ({
  async effective(ctx) {
    const identity = await resolveIdentity(strapi, ctx);
    if (!identity?.canAccess) {
      return ctx.forbidden('Moderator/Admin access required.');
    }

    const settings = await getCommunitySettings(strapi, { refresh: true });
    ctx.body = {
      data: settings,
    };
  },
}));

