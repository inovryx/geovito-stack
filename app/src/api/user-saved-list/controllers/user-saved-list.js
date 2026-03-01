'use strict';

const crypto = require('crypto');
const { createCoreController } = require('@strapi/strapi').factories;
const { authenticateFromBearer } = require('../../../modules/blog-engagement/auth');

const LIST_UID = 'api::user-saved-list.user-saved-list';
const ITEM_UID = 'api::user-saved-item.user-saved-item';
const USER_UID = 'plugin::users-permissions.user';

const VISIBILITY_SET = new Set(['private', 'public']);
const TARGET_TYPE_SET = new Set(['place', 'post']);
const ACTION_SET = new Set(['toggle', 'save', 'unsave']);

const parseIntValue = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const SAVED_LIST_MAX_PER_USER = parseIntValue(process.env.SAVED_LIST_MAX_PER_USER, 50, 1, 500);
const SAVED_LIST_ITEM_MAX = parseIntValue(process.env.SAVED_LIST_ITEM_MAX, 1000, 1, 20000);

const normalizeLower = (value) => String(value || '').trim().toLowerCase();
const normalizeTrim = (value) => String(value || '').trim();

const slugify = (value) =>
  normalizeLower(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);

const sanitizeNote = (value) => normalizeTrim(value).replace(/\s+/g, ' ').slice(0, 220);

const parsePayload = (ctx) => {
  const payload = ctx.request?.body?.data || ctx.request?.body || {};
  return payload && typeof payload === 'object' ? payload : {};
};

const makeListId = () => `list-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
const makeItemId = () => `item-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

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
  });
  if (!user || user.blocked === true) return null;
  return user;
};

const toPublicList = (entry) => ({
  list_id: entry?.list_id || '',
  slug: entry?.slug || '',
  title: entry?.title || '',
  description: entry?.description || '',
  visibility: entry?.visibility || 'private',
  is_default: entry?.is_default === true,
  created_at: entry?.createdAt || null,
  updated_at: entry?.updatedAt || null,
});

const toPublicItem = (entry) => ({
  item_id: entry?.item_id || '',
  list_id: entry?.list_id || '',
  target_type: entry?.target_type || '',
  target_ref: entry?.target_ref || '',
  note: entry?.note || '',
  created_at: entry?.createdAt || null,
  updated_at: entry?.updatedAt || null,
});

const findOwnerListByListId = async (strapi, ownerUserId, listId) => {
  const rows = await strapi.entityService.findMany(LIST_UID, {
    publicationState: 'preview',
    filters: {
      owner_user_id: Number(ownerUserId),
      list_id: String(listId || ''),
    },
    fields: ['id', 'list_id', 'slug', 'title', 'description', 'visibility', 'is_default', 'createdAt', 'updatedAt'],
    limit: 1,
  });
  return rows[0] || null;
};

const findOwnerListBySlug = async (strapi, ownerUserId, slug) => {
  const rows = await strapi.entityService.findMany(LIST_UID, {
    publicationState: 'preview',
    filters: {
      owner_user_id: Number(ownerUserId),
      slug: String(slug || ''),
    },
    fields: ['id', 'list_id', 'slug', 'title', 'description', 'visibility', 'is_default', 'createdAt', 'updatedAt'],
    limit: 1,
  });
  return rows[0] || null;
};

const findOwnerItem = async (strapi, ownerUserId, listId, targetType, targetRef) => {
  const rows = await strapi.entityService.findMany(ITEM_UID, {
    publicationState: 'preview',
    filters: {
      owner_user_id: Number(ownerUserId),
      list_id: String(listId || ''),
      target_type: String(targetType || ''),
      target_ref: String(targetRef || ''),
    },
    fields: ['id', 'item_id', 'list_id', 'target_type', 'target_ref', 'note', 'createdAt', 'updatedAt'],
    limit: 1,
  });
  return rows[0] || null;
};

module.exports = createCoreController(LIST_UID, ({ strapi }) => ({
  async myLists(ctx) {
    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const limit = parseIntValue(ctx.query?.limit, 100, 1, 500);
    const rows = await strapi.entityService.findMany(LIST_UID, {
      publicationState: 'preview',
      filters: {
        owner_user_id: Number(user.id),
      },
      fields: ['id', 'list_id', 'slug', 'title', 'description', 'visibility', 'is_default', 'createdAt', 'updatedAt'],
      sort: ['is_default:desc', 'createdAt:asc'],
      limit,
    });

    const items = Array.isArray(rows) ? rows : [];
    const serialized = await Promise.all(
      items.map(async (entry) => {
        const itemCount = await strapi.db.query(ITEM_UID).count({
          where: {
            owner_user_id: Number(user.id),
            list_id: String(entry.list_id || ''),
          },
        });
        return {
          ...toPublicList(entry),
          item_count: Number(itemCount || 0),
        };
      })
    );

    ctx.body = {
      data: {
        items: serialized,
      },
    };
  },

  async upsertMeList(ctx) {
    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const payload = parsePayload(ctx);
    const listId = normalizeTrim(payload.list_id);
    const title = normalizeTrim(payload.title).slice(0, 96);
    const description = normalizeTrim(payload.description).slice(0, 480);
    const slugInput = slugify(payload.slug || title);
    const visibility = normalizeLower(payload.visibility || 'private');
    const isDefault = payload.is_default === true;
    const requestIp = ctx.request.ip || ctx.ip || 'unknown';

    if (!slugInput) {
      return ctx.badRequest('slug or title is required.');
    }
    if (!title) {
      return ctx.badRequest('title is required.');
    }
    if (!VISIBILITY_SET.has(visibility)) {
      return ctx.badRequest('visibility is invalid.');
    }

    let existing = null;
    if (listId) {
      existing = await findOwnerListByListId(strapi, user.id, listId);
      if (!existing) return ctx.notFound('list_id not found.');
    } else {
      existing = await findOwnerListBySlug(strapi, user.id, slugInput);
    }

    if (isDefault) {
      await strapi.db.query(LIST_UID).updateMany({
        where: {
          owner_user_id: Number(user.id),
          is_default: true,
        },
        data: {
          is_default: false,
        },
      });
    }

    if (existing?.id) {
      const updated = await strapi.entityService.update(LIST_UID, Number(existing.id), {
        data: {
          slug: slugInput,
          title,
          description,
          visibility,
          is_default: isDefault,
          last_toggled_at: new Date().toISOString(),
        },
        fields: ['list_id', 'slug', 'title', 'description', 'visibility', 'is_default', 'createdAt', 'updatedAt'],
      });
      ctx.body = {
        data: {
          ...toPublicList(updated),
          created: false,
        },
      };
      return;
    }

    const currentCount = await strapi.db.query(LIST_UID).count({
      where: {
        owner_user_id: Number(user.id),
      },
    });
    if (currentCount >= SAVED_LIST_MAX_PER_USER) {
      return ctx.badRequest(`Saved list limit reached (max=${SAVED_LIST_MAX_PER_USER}).`);
    }

    const created = await strapi.entityService.create(LIST_UID, {
      data: {
        list_id: makeListId(),
        owner_user: Number(user.id),
        owner_user_id: Number(user.id),
        slug: slugInput,
        title,
        description,
        visibility,
        is_default: isDefault,
        created_from_ip: requestIp,
        last_toggled_at: new Date().toISOString(),
      },
    });

    ctx.status = 201;
    ctx.body = {
      data: {
        ...toPublicList(created),
        created: true,
      },
    };
  },

  async toggleMeItem(ctx) {
    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const payload = parsePayload(ctx);
    const listId = normalizeTrim(payload.list_id);
    const action = normalizeLower(payload.action || 'toggle');
    const targetType = normalizeLower(payload.target_type);
    const targetRef = normalizeTrim(payload.target_ref).toLowerCase().slice(0, 160);
    const note = sanitizeNote(payload.note);
    const requestIp = ctx.request.ip || ctx.ip || 'unknown';

    if (!listId) return ctx.badRequest('list_id is required.');
    if (!ACTION_SET.has(action)) return ctx.badRequest('action is invalid.');
    if (!TARGET_TYPE_SET.has(targetType)) return ctx.badRequest('target_type is invalid.');
    if (!targetRef) return ctx.badRequest('target_ref is required.');

    const list = await findOwnerListByListId(strapi, user.id, listId);
    if (!list) return ctx.notFound('list_id not found.');

    const existing = await findOwnerItem(strapi, user.id, listId, targetType, targetRef);

    if (action === 'unsave' || (action === 'toggle' && existing?.id)) {
      if (existing?.id) {
        await strapi.entityService.delete(ITEM_UID, Number(existing.id));
      }
      ctx.body = {
        data: {
          list_id: listId,
          target_type: targetType,
          target_ref: targetRef,
          saved: false,
          item_id: null,
        },
      };
      return;
    }

    if (existing?.id) {
      const updated = await strapi.entityService.update(ITEM_UID, Number(existing.id), {
        data: {
          note,
          last_toggled_at: new Date().toISOString(),
        },
        fields: ['item_id', 'list_id', 'target_type', 'target_ref', 'note', 'createdAt', 'updatedAt'],
      });
      ctx.body = {
        data: {
          ...toPublicItem(updated),
          saved: true,
        },
      };
      return;
    }

    const currentListItems = await strapi.db.query(ITEM_UID).count({
      where: {
        owner_user_id: Number(user.id),
        list_id: listId,
      },
    });
    if (currentListItems >= SAVED_LIST_ITEM_MAX) {
      return ctx.badRequest(`Saved item limit reached for this list (max=${SAVED_LIST_ITEM_MAX}).`);
    }

    const created = await strapi.entityService.create(ITEM_UID, {
      data: {
        item_id: makeItemId(),
        owner_user: Number(user.id),
        owner_user_id: Number(user.id),
        list: Number(list.id),
        list_id: listId,
        target_type: targetType,
        target_ref: targetRef,
        note,
        saved_from_ip: requestIp,
        last_toggled_at: new Date().toISOString(),
      },
    });

    ctx.status = 201;
    ctx.body = {
      data: {
        ...toPublicItem(created),
        saved: true,
      },
    };
  },

  async myItems(ctx) {
    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const listId = normalizeTrim(ctx.query?.list_id);
    const targetType = normalizeLower(ctx.query?.target_type);
    const limit = parseIntValue(ctx.query?.limit, 100, 1, 1000);
    const filters = {
      owner_user_id: Number(user.id),
    };

    if (listId) {
      const list = await findOwnerListByListId(strapi, user.id, listId);
      if (!list) return ctx.notFound('list_id not found.');
      filters.list_id = listId;
    }
    if (TARGET_TYPE_SET.has(targetType)) {
      filters.target_type = targetType;
    }

    const rows = await strapi.entityService.findMany(ITEM_UID, {
      publicationState: 'preview',
      filters,
      fields: ['item_id', 'list_id', 'target_type', 'target_ref', 'note', 'createdAt', 'updatedAt'],
      sort: ['createdAt:desc'],
      limit,
    });

    ctx.body = {
      data: {
        items: Array.isArray(rows) ? rows.map(toPublicItem) : [],
      },
    };
  },
}));
