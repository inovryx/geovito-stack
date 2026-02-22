'use strict';

const crypto = require('crypto');
const { createCoreController } = require('@strapi/strapi').factories;
const { normalizePublicCommentPayload } = require('../../../modules/blog-engagement/comment-payload');
const {
  BLOG_COMMENT_SOURCE,
  BLOG_COMMENT_STATUS,
  COMMENT_PUBLIC_LIMITS,
  getRegisteredAutoApproveAfter,
  getGuestMaxLinks,
  getGuestSpamLinks,
} = require('../../../modules/blog-engagement/constants');
const { evaluateGuestCommentSafety } = require('../../../modules/blog-engagement/comment-content-safety');
const { verifyGuestCommentTurnstile } = require('../../../modules/blog-engagement/turnstile');
const { authenticateFromBearer } = require('../../../modules/blog-engagement/auth');
const { getClientIp, isLimited } = require('../../../modules/blog-engagement/rate-limit');
const { log } = require('../../../modules/domain-logging');
const { resolveActor } = require('../../../modules/domain-logging/context');

const UID = 'api::blog-comment.blog-comment';
const BLOG_POST_UID = 'api::blog-post.blog-post';
const USERS_PERMISSIONS_USER_UID = 'plugin::users-permissions.user';
const COMMENT_STATUS_SET = new Set(Object.values(BLOG_COMMENT_STATUS));
const OWNER_EMAIL_HINT = String(
  process.env.OWNER_EMAIL || process.env.PUBLIC_OWNER_EMAIL || ''
).trim().toLowerCase();

const toPublicComment = (entry) => {
  if (!entry) return null;

  return {
    comment_id: entry.comment_id,
    body: entry.body,
    language: entry.language || 'en',
    source: entry.source,
    display_name: entry.source === BLOG_COMMENT_SOURCE.REGISTERED ? entry.owner_username || null : entry.guest_display_name || null,
    created_at: entry.createdAt,
  };
};

const toOwnComment = (entry) => {
  if (!entry) return null;

  return {
    comment_id: entry.comment_id,
    body: entry.body,
    language: entry.language || 'en',
    source: entry.source,
    status: entry.status,
    blog_post_ref: entry.blog_post_ref || null,
    moderation_notes: entry.moderation_notes || null,
    reviewed_at: entry.reviewed_at || null,
    reviewed_by: entry.reviewed_by || null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
};

const findBlogPostByPostId = async (strapi, postId) => {
  const entries = await strapi.entityService.findMany(BLOG_POST_UID, {
    publicationState: 'preview',
    filters: {
      post_id: postId,
    },
    fields: ['id', 'post_id', 'mock'],
    limit: 1,
  });

  return entries[0] || null;
};

const hashIp = (rawIp) => {
  const salt = String(process.env.BLOG_COMMENT_IP_HASH_SALT || process.env.API_TOKEN_SALT || 'blog-comment');
  return crypto.createHash('sha256').update(`${salt}:${String(rawIp || 'unknown')}`).digest('hex');
};

const parseIntSafe = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const MODERATION_STALE_HOURS = parseIntSafe(
  process.env.BLOG_COMMENT_MODERATION_STALE_HOURS,
  24,
  1,
  24 * 30
);

const normalizeSortOrder = (value) => (String(value || '').toLowerCase() === 'asc' ? 'asc' : 'desc');
const normalizeLower = (value) => String(value || '').trim().toLowerCase();
const normalizeCommentStatus = (value) => {
  const normalized = normalizeLower(value);
  if (!normalized) return null;
  return COMMENT_STATUS_SET.has(normalized) ? normalized : null;
};

const normalizeNonNegativeInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed);
};

const buildModerationSummary = async (strapi, staleHours = MODERATION_STALE_HOURS) => {
  const thresholdMs = Date.now() - staleHours * 60 * 60 * 1000;
  const thresholdIso = new Date(thresholdMs).toISOString();

  const [pendingTotal, stalePendingTotal, oldestPendingEntries] = await Promise.all([
    strapi.entityService.count(UID, {
      filters: { status: BLOG_COMMENT_STATUS.PENDING },
    }),
    strapi.entityService.count(UID, {
      filters: {
        status: BLOG_COMMENT_STATUS.PENDING,
        createdAt: { $lt: thresholdIso },
      },
    }),
    strapi.entityService.findMany(UID, {
      publicationState: 'preview',
      filters: { status: BLOG_COMMENT_STATUS.PENDING },
      fields: ['createdAt'],
      sort: ['createdAt:asc'],
      limit: 1,
    }),
  ]);

  const oldestCreatedAt = Array.isArray(oldestPendingEntries)
    ? oldestPendingEntries[0]?.createdAt
    : null;
  let oldestPendingHours = 0;
  if (oldestCreatedAt) {
    const oldestMs = new Date(String(oldestCreatedAt)).getTime();
    if (Number.isFinite(oldestMs) && oldestMs > 0) {
      oldestPendingHours = Math.max(0, Math.floor((Date.now() - oldestMs) / (60 * 60 * 1000)));
    }
  }

  return {
    stale_threshold_hours: staleHours,
    pending_total: normalizeNonNegativeInt(pendingTotal),
    stale_pending_total: normalizeNonNegativeInt(stalePendingTotal),
    oldest_pending_hours: normalizeNonNegativeInt(oldestPendingHours),
  };
};

const findCommentByCommentId = async (strapi, commentId) => {
  const entries = await strapi.entityService.findMany(UID, {
    publicationState: 'preview',
    filters: {
      comment_id: commentId,
    },
    fields: [
      'id',
      'comment_id',
      'body',
      'language',
      'source',
      'status',
      'blog_post_ref',
      'guest_display_name',
      'owner_username',
      'moderation_notes',
      'reviewed_at',
      'reviewed_by',
      'createdAt',
      'updatedAt',
    ],
    limit: 1,
  });

  return entries[0] || null;
};

const resolveModerationIdentity = async (strapi, ctx) => {
  const baseUser = ctx.state?.user?.id ? ctx.state.user : await authenticateFromBearer(strapi, ctx);
  if (!baseUser?.id) return null;

  const user = await strapi.entityService.findOne(USERS_PERMISSIONS_USER_UID, Number(baseUser.id), {
    fields: ['id', 'email', 'username', 'confirmed', 'blocked'],
    populate: {
      role: {
        fields: ['id', 'type', 'name'],
      },
    },
  });

  if (!user || user.blocked === true) return null;

  const roleRaw = normalizeLower(user?.role?.type || user?.role?.name || '');
  const isAdmin = roleRaw.includes('super') || roleRaw.includes('admin');
  const isEditor = isAdmin || roleRaw.includes('editor');
  const isOwner = Boolean(OWNER_EMAIL_HINT) && normalizeLower(user.email) === OWNER_EMAIL_HINT;
  const canModerate = isEditor || isOwner;

  return {
    user,
    canModerate,
    roleRaw,
    isAdmin,
    isEditor,
    isOwner,
  };
};

const toModerationComment = (entry) => {
  if (!entry) return null;
  return {
    comment_id: entry.comment_id,
    body: entry.body,
    language: entry.language || 'en',
    source: entry.source,
    status: entry.status,
    blog_post_ref: entry.blog_post_ref || null,
    display_name:
      entry.source === BLOG_COMMENT_SOURCE.REGISTERED
        ? entry.owner_username || null
        : entry.guest_display_name || null,
    moderation_notes: entry.moderation_notes || null,
    reviewed_at: entry.reviewed_at || null,
    reviewed_by: entry.reviewed_by || null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
};

module.exports = createCoreController(UID, ({ strapi }) => ({
  async find(ctx) {
    const postId = String(ctx.query?.post_id || '').trim();
    const limit = parseIntSafe(ctx.query?.limit, 50, 1, 200);
    const sortOrder = normalizeSortOrder(ctx.query?.sort);

    const filters = {
      status: BLOG_COMMENT_STATUS.APPROVED,
    };

    if (postId) {
      filters.blog_post_ref = postId;
    }

    const entries = await strapi.entityService.findMany(UID, {
      filters,
      sort: [`createdAt:${sortOrder}`],
      fields: ['comment_id', 'body', 'language', 'source', 'guest_display_name', 'owner_username', 'createdAt', 'blog_post_ref'],
      limit,
    });

    ctx.body = {
      data: Array.isArray(entries) ? entries.map(toPublicComment) : [],
    };
  },

  async findOne(ctx) {
    const id = String(ctx.params?.id || '').trim();
    if (!id) {
      return ctx.badRequest('id is required');
    }

    const entry = await strapi.entityService.findOne(UID, id, {
      fields: ['comment_id', 'body', 'language', 'source', 'guest_display_name', 'owner_username', 'createdAt', 'status'],
    });

    if (!entry || entry.status !== BLOG_COMMENT_STATUS.APPROVED) {
      return ctx.notFound('Comment not found');
    }

    ctx.body = {
      data: toPublicComment(entry),
    };
  },

  async myComments(ctx) {
    const requestId = ctx.state?.requestId || null;
    const actor = resolveActor(ctx);
    const user = ctx.state?.user?.id ? ctx.state.user : await authenticateFromBearer(strapi, ctx);

    if (!user?.id) {
      await log(
        'blog',
        'WARN',
        'blog.comment.my.unauthorized',
        'Unauthorized my-comments request',
        {},
        { request_id: requestId, actor }
      );
      ctx.status = 401;
      ctx.body = {
        data: null,
        error: {
          status: 401,
          name: 'UnauthorizedError',
          message: 'Authentication required',
          details: {},
        },
      };
      return;
    }

    const limit = parseIntSafe(ctx.query?.limit, 30, 1, 200);
    const sortOrder = normalizeSortOrder(ctx.query?.sort);
    const status = normalizeCommentStatus(ctx.query?.status);

    if (String(ctx.query?.status || '').trim() && !status) {
      return ctx.badRequest('status is invalid');
    }

    const filters = {
      owner_user_id: Number(user.id),
      source: BLOG_COMMENT_SOURCE.REGISTERED,
    };

    if (status) {
      filters.status = status;
    }

    const entries = await strapi.entityService.findMany(UID, {
      filters,
      sort: [`createdAt:${sortOrder}`],
      fields: [
        'comment_id',
        'body',
        'language',
        'source',
        'status',
        'blog_post_ref',
        'moderation_notes',
        'reviewed_at',
        'reviewed_by',
        'createdAt',
        'updatedAt',
      ],
      limit,
    });

    const counts = {
      pending: 0,
      approved: 0,
      rejected: 0,
      spam: 0,
      deleted: 0,
    };

    if (Array.isArray(entries)) {
      for (const entry of entries) {
        const key = String(entry?.status || '').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(counts, key)) {
          counts[key] += 1;
        }
      }
    }

    ctx.body = {
      data: Array.isArray(entries) ? entries.map(toOwnComment) : [],
      meta: {
        limit,
        status: status || 'all',
        counts,
      },
    };
  },

  async moderationList(ctx) {
    const requestId = ctx.state?.requestId || null;
    const actor = resolveActor(ctx);
    const identity = await resolveModerationIdentity(strapi, ctx);

    if (!identity?.user?.id) {
      await log(
        'blog',
        'WARN',
        'blog.comment.moderation.list.unauthorized',
        'Unauthorized moderation-list request',
        {},
        { request_id: requestId, actor }
      );
      ctx.status = 401;
      ctx.body = {
        data: null,
        error: {
          status: 401,
          name: 'UnauthorizedError',
          message: 'Authentication required',
          details: {},
        },
      };
      return;
    }

    if (!identity.canModerate) {
      await log(
        'blog',
        'WARN',
        'blog.comment.moderation.list.forbidden',
        'Forbidden moderation-list request',
        {
          user_id: identity.user.id,
          role: identity.roleRaw || 'member',
        },
        { request_id: requestId, actor }
      );
      ctx.status = 403;
      ctx.body = {
        data: null,
        error: {
          status: 403,
          name: 'ForbiddenError',
          message: 'Moderator role required',
          details: {},
        },
      };
      return;
    }

    const limit = parseIntSafe(ctx.query?.limit, 20, 1, 100);
    const sortOrder = normalizeSortOrder(ctx.query?.sort);
    const statusRaw = normalizeLower(ctx.query?.status || '');
    let status = BLOG_COMMENT_STATUS.PENDING;

    if (statusRaw === 'all') {
      status = null;
    } else if (statusRaw) {
      status = normalizeCommentStatus(statusRaw);
      if (!status) {
        return ctx.badRequest('status is invalid');
      }
    }

    const filters = {};
    if (status) {
      filters.status = status;
    }

    const entries = await strapi.entityService.findMany(UID, {
      publicationState: 'preview',
      filters,
      sort: [`createdAt:${sortOrder}`],
      fields: [
        'comment_id',
        'body',
        'language',
        'source',
        'status',
        'blog_post_ref',
        'guest_display_name',
        'owner_username',
        'moderation_notes',
        'reviewed_at',
        'reviewed_by',
        'createdAt',
        'updatedAt',
      ],
      limit,
    });

    let summary = null;
    try {
      summary = await buildModerationSummary(strapi);
    } catch (error) {
      await log(
        'blog',
        'WARN',
        'blog.comment.moderation.summary.failed',
        'Failed to compute moderation summary',
        {
          user_id: identity.user.id,
          error: error instanceof Error ? error.message : String(error || 'unknown_error'),
        },
        { request_id: requestId, actor }
      );
    }

    ctx.body = {
      data: Array.isArray(entries) ? entries.map(toModerationComment) : [],
      meta: {
        limit,
        status: status || 'all',
        summary,
      },
    };
  },

  async moderationSet(ctx) {
    const requestId = ctx.state?.requestId || null;
    const actor = resolveActor(ctx);
    const identity = await resolveModerationIdentity(strapi, ctx);

    if (!identity?.user?.id) {
      await log(
        'blog',
        'WARN',
        'blog.comment.moderation.set.unauthorized',
        'Unauthorized moderation-set request',
        {},
        { request_id: requestId, actor }
      );
      ctx.status = 401;
      ctx.body = {
        data: null,
        error: {
          status: 401,
          name: 'UnauthorizedError',
          message: 'Authentication required',
          details: {},
        },
      };
      return;
    }

    if (!identity.canModerate) {
      await log(
        'blog',
        'WARN',
        'blog.comment.moderation.set.forbidden',
        'Forbidden moderation-set request',
        {
          user_id: identity.user.id,
          role: identity.roleRaw || 'member',
        },
        { request_id: requestId, actor }
      );
      ctx.status = 403;
      ctx.body = {
        data: null,
        error: {
          status: 403,
          name: 'ForbiddenError',
          message: 'Moderator role required',
          details: {},
        },
      };
      return;
    }

    const payload = ctx.request.body && typeof ctx.request.body === 'object' ? ctx.request.body : {};
    const commentId = String(payload.comment_id || '').trim();
    const status = normalizeCommentStatus(payload.status);
    const moderationNotes =
      typeof payload.moderation_notes === 'string' ? payload.moderation_notes : undefined;

    if (!commentId) {
      return ctx.badRequest('comment_id is required');
    }

    if (!status) {
      return ctx.badRequest('status is invalid');
    }

    const existing = await findCommentByCommentId(strapi, commentId);
    if (!existing?.id) {
      return ctx.notFound('Comment not found');
    }

    ctx.state.user = identity.user;

    const data = { status };
    if (typeof moderationNotes === 'string') {
      data.moderation_notes = moderationNotes;
    }

    const updated = await strapi.entityService.update(UID, existing.id, {
      data,
      fields: [
        'comment_id',
        'body',
        'language',
        'source',
        'status',
        'blog_post_ref',
        'moderation_notes',
        'reviewed_at',
        'reviewed_by',
        'createdAt',
        'updatedAt',
      ],
    });

    await log(
      'blog',
      'INFO',
      'blog.comment.moderation.set.updated',
      'Blog comment moderated',
      {
        comment_id: updated.comment_id,
        from_status: existing.status,
        to_status: updated.status,
      },
      {
        request_id: requestId,
        actor,
        entity_ref: updated.comment_id,
      }
    );

    ctx.body = {
      data: toOwnComment(updated),
    };
  },

  async submit(ctx) {
    const requestId = ctx.state?.requestId || null;
    const actor = resolveActor(ctx);
    const clientIp = getClientIp(ctx);
    const ipKey = `blog-comment:${clientIp}`;

    const isRateLimited = isLimited(
      ipKey,
      COMMENT_PUBLIC_LIMITS.RATE_WINDOW_MS,
      COMMENT_PUBLIC_LIMITS.RATE_MAX_REQUESTS
    );

    if (isRateLimited) {
      const message = 'Too many comment submissions. Please try later.';
      await log('blog', 'WARN', 'blog.comment.submit.rate_limited', message, { ip: clientIp }, { request_id: requestId, actor });
      ctx.status = 429;
      ctx.body = {
        ok: false,
        error: message,
      };
      return;
    }

    const user = ctx.state?.user?.id
      ? ctx.state.user
      : await authenticateFromBearer(strapi, ctx);
    const payload = normalizePublicCommentPayload(ctx.request.body || {}, {
      isAuthenticated: Boolean(user?.id),
    });

    const blogPost = await findBlogPostByPostId(strapi, payload.post_id);
    if (!blogPost?.id) {
      return ctx.badRequest('post_id not found');
    }

    const source = user?.id ? BLOG_COMMENT_SOURCE.REGISTERED : BLOG_COMMENT_SOURCE.GUEST;
    if (source === BLOG_COMMENT_SOURCE.GUEST) {
      const turnstileCheck = await verifyGuestCommentTurnstile(ctx);
      if (!turnstileCheck.ok) {
        await log(
          'blog',
          'WARN',
          'blog.comment.submit.turnstile_blocked',
          turnstileCheck.message,
          {
            post_id: payload.post_id,
            name: turnstileCheck.name,
            details: turnstileCheck.details || {},
          },
          { request_id: requestId, actor }
        );

        ctx.status = turnstileCheck.status;
        ctx.body = {
          data: null,
          error: {
            status: turnstileCheck.status,
            name: turnstileCheck.name,
            message: turnstileCheck.message,
            details: turnstileCheck.details || {},
          },
        };
        return;
      }
    }

    let status = BLOG_COMMENT_STATUS.PENDING;
    let moderationNotes = null;

    if (source === BLOG_COMMENT_SOURCE.REGISTERED) {
      const submittedByUser = await strapi.entityService.findMany(UID, {
        filters: {
          owner_user_id: Number(user.id),
          source: BLOG_COMMENT_SOURCE.REGISTERED,
          status: {
            $notIn: [BLOG_COMMENT_STATUS.DELETED, BLOG_COMMENT_STATUS.SPAM],
          },
        },
        fields: ['id'],
        limit: 200,
      });

      const approvedAfter = getRegisteredAutoApproveAfter();
      status = submittedByUser.length >= approvedAfter ? BLOG_COMMENT_STATUS.APPROVED : BLOG_COMMENT_STATUS.PENDING;
    } else {
      const safety = evaluateGuestCommentSafety(payload.body, {
        maxLinks: getGuestMaxLinks(),
        spamLinks: getGuestSpamLinks(),
      });

      if (safety.forcedStatus) {
        status = safety.forcedStatus;
        moderationNotes = safety.moderationNotes;

        await log(
          'blog',
          'INFO',
          'blog.comment.submit.auto_flagged',
          'Guest comment auto-flagged by link policy',
          {
            post_id: payload.post_id,
            forced_status: safety.forcedStatus,
            url_count: safety.urlCount,
          },
          { request_id: requestId, actor }
        );
      }
    }

    const created = await strapi.service(UID).createFromPublicSubmission({
      payload,
      source,
      status,
      blogPost,
      user,
      clientIpHash: hashIp(clientIp),
      moderationNotes,
    });

    await log(
      'blog',
      'INFO',
      'blog.comment.submit.created',
      'Blog comment submitted',
      {
        post_id: payload.post_id,
        source,
        moderation_status: status,
      },
      {
        request_id: requestId,
        actor,
        entity_ref: created.comment_id,
      }
    );

    ctx.status = 201;
    ctx.body = {
      ok: true,
      status: 'received',
      moderation_status: status,
      comment_ref: created.comment_id,
    };
  },

  async countForPost(ctx) {
    const postId = String(ctx.params?.postId || '').trim();
    if (!postId) {
      return ctx.badRequest('postId is required');
    }

    const entries = await strapi.entityService.findMany(UID, {
      filters: {
        blog_post_ref: postId,
        status: BLOG_COMMENT_STATUS.APPROVED,
      },
      fields: ['id'],
      limit: 5000,
    });

    ctx.body = {
      data: {
        post_id: postId,
        approved_count: entries.length,
      },
    };
  },
}));
