'use strict';

const crypto = require('crypto');
const { createCoreController } = require('@strapi/strapi').factories;
const { LIKE_LIMITS, parseIntEnv } = require('../../../modules/blog-engagement/constants');
const { authenticateFromBearer } = require('../../../modules/blog-engagement/auth');
const { getClientIp, isLimited } = require('../../../modules/blog-engagement/rate-limit');
const { sanitizeText } = require('../../../modules/suggestions/sanitize');
const { log } = require('../../../modules/domain-logging');
const { resolveActor } = require('../../../modules/domain-logging/context');

const UID = 'api::blog-like.blog-like';
const BLOG_POST_UID = 'api::blog-post.blog-post';

const hashIp = (rawIp) => {
  const salt = String(process.env.BLOG_LIKE_IP_HASH_SALT || process.env.API_TOKEN_SALT || 'blog-like');
  return crypto.createHash('sha256').update(`${salt}:${String(rawIp || 'unknown')}`).digest('hex');
};

const getLikeRateWindow = () => Math.max(1000, parseIntEnv(process.env.BLOG_LIKE_RATE_WINDOW_MS, LIKE_LIMITS.RATE_WINDOW_MS));
const getLikeRateMax = () => Math.max(1, parseIntEnv(process.env.BLOG_LIKE_RATE_MAX, LIKE_LIMITS.RATE_MAX_REQUESTS));

const findBlogPostByPostId = async (strapi, postId) => {
  const entries = await strapi.entityService.findMany(BLOG_POST_UID, {
    publicationState: 'preview',
    filters: {
      post_id: postId,
    },
    fields: ['id', 'post_id'],
    limit: 1,
  });
  return entries[0] || null;
};

const countLikesForPost = async (strapi, postId) => {
  const entries = await strapi.entityService.findMany(UID, {
    filters: {
      blog_post_ref: postId,
    },
    fields: ['id'],
    limit: 10000,
  });
  return entries.length;
};

module.exports = createCoreController(UID, ({ strapi }) => ({
  async toggle(ctx) {
    const requestId = ctx.state?.requestId || null;
    const actor = resolveActor(ctx);
    const authUser =
      ctx.state?.user?.id
        ? ctx.state.user
        : await authenticateFromBearer(strapi, ctx);
    const userId = Number(authUser?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return ctx.unauthorized('Authentication is required.');
    }

    const postId = sanitizeText(ctx.request.body?.post_id || ctx.request.body?.data?.post_id || '');
    if (!postId) {
      return ctx.badRequest('post_id is required');
    }

    const clientIp = getClientIp(ctx);
    const rateKey = `blog-like:${userId}:${clientIp}`;
    if (isLimited(rateKey, getLikeRateWindow(), getLikeRateMax())) {
      await log('blog', 'WARN', 'blog.like.toggle.rate_limited', 'Too many like toggles', { post_id: postId }, { request_id: requestId, actor });
      ctx.status = 429;
      ctx.body = {
        ok: false,
        error: 'Too many like actions. Please try later.',
      };
      return;
    }

    const blogPost = await findBlogPostByPostId(strapi, postId);
    if (!blogPost?.id) {
      return ctx.badRequest('post_id not found');
    }

    const likeKey = `${postId}:${userId}`;
    const existing = await strapi.entityService.findMany(UID, {
      filters: {
        like_key: likeKey,
      },
      fields: ['id'],
      limit: 1,
    });

    let liked = false;
    if (existing[0]?.id) {
      await strapi.entityService.delete(UID, existing[0].id);
      liked = false;
    } else {
      await strapi.entityService.create(UID, {
        data: {
          like_key: likeKey,
          owner_user: userId,
          owner_user_id: userId,
          blog_post: blogPost.id,
          blog_post_ref: postId,
          client_ip_hash: hashIp(clientIp),
        },
      });
      liked = true;
    }

    const likeCount = await countLikesForPost(strapi, postId);

    await log(
      'blog',
      'INFO',
      'blog.like.toggle',
      'Blog like toggled',
      {
        post_id: postId,
        liked,
        like_count: likeCount,
      },
      {
        request_id: requestId,
        actor,
        entity_ref: likeKey,
      }
    );

    ctx.body = {
      ok: true,
      post_id: postId,
      liked,
      like_count: likeCount,
    };
  },

  async countForPost(ctx) {
    const postId = sanitizeText(ctx.params?.postId || '');
    if (!postId) {
      return ctx.badRequest('postId is required');
    }

    const likeCount = await countLikesForPost(strapi, postId);
    ctx.body = {
      data: {
        post_id: postId,
        like_count: likeCount,
      },
    };
  },
}));
