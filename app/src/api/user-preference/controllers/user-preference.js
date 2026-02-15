'use strict';

const MODEL_UID = 'api::user-preference.user-preference';
const DEFAULT_UI_LANGUAGE = 'en';
const LANGUAGE_PATTERN = /^[a-z]{2}(?:-[a-z0-9]{2,8})?$/i;

const normalizeLanguage = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return LANGUAGE_PATTERN.test(normalized) ? normalized : null;
};

const getUserId = (ctx) => {
  const rawId = ctx?.state?.user?.id;
  const parsed = Number(rawId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const findPreference = async (userId) => {
  const records = await strapi.entityService.findMany(MODEL_UID, {
    filters: { owner_user_id: userId },
    limit: 1,
  });

  if (!Array.isArray(records) || records.length === 0) return null;
  return records[0];
};

module.exports = {
  async getMe(ctx) {
    const userId = getUserId(ctx);
    if (!userId) return ctx.unauthorized('Authentication is required.');

    const preference = await findPreference(userId);

    ctx.body = {
      data: {
        preferred_ui_language: preference?.preferred_ui_language || DEFAULT_UI_LANGUAGE,
        source: preference ? 'profile' : 'default',
      },
    };
  },

  async upsertMe(ctx) {
    const userId = getUserId(ctx);
    if (!userId) return ctx.unauthorized('Authentication is required.');

    const payload = ctx.request.body?.data || ctx.request.body || {};
    const preferredLanguage = normalizeLanguage(payload.preferred_ui_language);

    if (!preferredLanguage) {
      return ctx.badRequest('preferred_ui_language is required and must be a valid language code.');
    }

    const existing = await findPreference(userId);
    const requestIp = ctx.request.ip || ctx.ip || 'unknown';

    if (existing?.id) {
      const updated = await strapi.entityService.update(MODEL_UID, existing.id, {
        data: {
          preferred_ui_language: preferredLanguage,
          updated_from_ip: requestIp,
        },
      });

      ctx.body = {
        data: {
          id: updated.id,
          preferred_ui_language: updated.preferred_ui_language,
        },
      };
      return;
    }

    const created = await strapi.entityService.create(MODEL_UID, {
      data: {
        owner_user_id: userId,
        preferred_ui_language: preferredLanguage,
        updated_from_ip: requestIp,
      },
    });

    ctx.body = {
      data: {
        id: created.id,
        preferred_ui_language: created.preferred_ui_language,
      },
    };
  },
};
