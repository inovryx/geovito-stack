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
const COMMENT_STATUS_SET = new Set(Object.values(BLOG_COMMENT_STATUS));

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

const normalizeSortOrder = (value) => (String(value || '').toLowerCase() === 'asc' ? 'asc' : 'desc');
const normalizeCommentStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return COMMENT_STATUS_SET.has(normalized) ? normalized : null;
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
