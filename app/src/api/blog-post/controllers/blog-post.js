'use strict';

const crypto = require('crypto');
const { createCoreController } = require('@strapi/strapi').factories;
const { authenticateFromBearer } = require('../../../modules/blog-engagement/auth');
const { detectUrlCount } = require('../../../modules/blog-engagement/comment-content-safety');
const { getCommunitySettings } = require('../../../modules/community-settings');
const { createRevision } = require('../../../modules/blog-engagement/revisions');
const { resolveOwnerEmailHints, isOwnerEmail } = require('../../../modules/security/owner-emails');
const { resolveActorFromIdentity, writeAuditLog } = require('../../../modules/security/audit-log');

const BLOG_POST_UID = 'api::blog-post.blog-post';
const USER_UID = 'plugin::users-permissions.user';

const BLOG_LANGUAGES = new Set(['en', 'tr', 'de', 'es', 'ru', 'zh-cn']);
const SUBMISSION_STATES = new Set(['draft', 'submitted', 'approved', 'rejected', 'spam', 'deleted']);
const MODERATION_TARGET_STATES = new Set(['approved', 'rejected', 'spam', 'deleted']);
const SITE_VISIBILITY_SET = new Set(['visible', 'hidden']);
const OWNER_EMAIL_HINTS = resolveOwnerEmailHints(process.env);

const isTrue = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const normalizeLanguage = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return BLOG_LANGUAGES.has(normalized) ? normalized : 'en';
};

const normalizeSubmissionState = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return SUBMISSION_STATES.has(normalized) ? normalized : null;
};

const normalizeSiteVisibility = (value, fallback = 'visible') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return SITE_VISIBILITY_SET.has(normalized) ? normalized : fallback;
};

const normalizeSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const sanitizeText = (value, maxLength = 5000) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
};

const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parsePayload = (ctx) => ctx.request?.body?.data || ctx.request?.body || {};

const parseLimit = (value, fallback = 20, min = 1, max = 100) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const pickTranslation = (post, preferredLanguage = 'en') => {
  const translations = Array.isArray(post?.translations) ? post.translations : [];
  const preferred = translations.find((entry) => String(entry?.language || '').toLowerCase() === preferredLanguage);
  const preferredComplete = preferred && preferred.status === 'complete' ? preferred : null;
  if (preferredComplete) return preferredComplete;

  const canonicalLanguage = normalizeLanguage(post?.canonical_language || 'en');
  const canonicalComplete = translations.find(
    (entry) => String(entry?.language || '').toLowerCase() === canonicalLanguage && entry?.status === 'complete'
  );
  if (canonicalComplete) return canonicalComplete;

  return preferred || canonicalComplete || translations[0] || null;
};

const buildTranslationPatch = (existing, patch) => {
  const merged = {
    ...existing,
    ...patch,
  };
  merged.language = normalizeLanguage(merged.language || 'en');
  merged.status = ['missing', 'draft', 'complete'].includes(String(merged.status || '').toLowerCase())
    ? String(merged.status || '').toLowerCase()
    : 'draft';
  if (typeof merged.slug === 'string') {
    merged.slug = normalizeSlug(merged.slug);
  }
  if (merged.canonical_path && typeof merged.canonical_path === 'string' && !merged.canonical_path.startsWith('/')) {
    merged.canonical_path = `/${merged.canonical_path}`;
  }
  return merged;
};

const upsertTranslation = (translations, language, patch) => {
  const items = Array.isArray(translations) ? translations.slice() : [];
  const normalizedLanguage = normalizeLanguage(language);
  const index = items.findIndex((entry) => String(entry?.language || '').toLowerCase() === normalizedLanguage);

  if (index >= 0) {
    items[index] = buildTranslationPatch(items[index] || {}, patch);
  } else {
    items.push(
      buildTranslationPatch(
        {
          language: normalizedLanguage,
          status: 'draft',
          runtime_translation: false,
          indexable: false,
        },
        patch
      )
    );
  }

  return items;
};

const generatePostId = () => `ugc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

const resolveAuthUser = async (strapi, ctx) => {
  const raw = ctx.state?.user?.id ? ctx.state.user : await authenticateFromBearer(strapi, ctx);
  const userId = toPositiveInt(raw?.id);
  if (!userId) return null;

  const user = await strapi.entityService.findOne(USER_UID, userId, {
    fields: ['id', 'username', 'email', 'blocked'],
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

  const roleRaw = String(user?.role?.type || user?.role?.name || '')
    .trim()
    .toLowerCase();
  const isAdmin = roleRaw.includes('super') || roleRaw.includes('admin');
  const isEditor = isAdmin || roleRaw.includes('editor');
  const isOwner = isOwnerEmail(user.email, OWNER_EMAIL_HINTS);

  return {
    user,
    isAdmin,
    isEditor,
    isOwner,
    canModerate: isAdmin || isEditor || isOwner,
  };
};

const findPostByPostId = async (strapi, postId, options = {}) => {
  const filters = {
    post_id: postId,
  };
  if (options.content_source) filters.content_source = options.content_source;
  if (options.owner_user_id !== undefined) filters.owner_user_id = Number(options.owner_user_id);

  const entries = await strapi.entityService.findMany(BLOG_POST_UID, {
    publicationState: 'preview',
    filters,
    populate: {
      translations: true,
      related_places: {
        fields: ['id', 'place_id', 'place_type'],
      },
    },
    limit: 1,
  });

  return entries[0] || null;
};

const validatePostLinkPolicy = (bodyValue, communitySettings) => {
  const body = String(bodyValue || '');
  const urlCount = detectUrlCount(body);
  const linksEnabled = communitySettings?.post_links_enabled !== false;
  const limit = Math.max(0, Number(communitySettings?.post_link_limit ?? 4));

  if (!linksEnabled && urlCount > 0) {
    return {
      ok: false,
      message: 'Links are disabled for user posts.',
    };
  }

  if (linksEnabled && urlCount > limit) {
    return {
      ok: false,
      message: `Post link limit exceeded (max=${limit}, found=${urlCount}).`,
    };
  }

  return { ok: true };
};

const toPostSummary = (post, preferredLanguage = 'en') => {
  const translation = pickTranslation(post, preferredLanguage);
  const slug = sanitizeText(translation?.slug || '', 220);
  const language = normalizeLanguage(translation?.language || post?.canonical_language || 'en');

  return {
    post_id: post.post_id,
    content_source: post.content_source || 'editorial',
    submission_state: post.submission_state || 'approved',
    site_visibility: normalizeSiteVisibility(post.site_visibility || 'visible'),
    canonical_language: normalizeLanguage(post.canonical_language || 'en'),
    original_language: normalizeLanguage(post.original_language || post.canonical_language || 'en'),
    owner_user_id: post.owner_user_id || null,
    owner_username_snapshot: post.owner_username_snapshot || null,
    published_on: post.published_on || null,
    published_at: post.publishedAt || null,
    mock: post.mock === true,
    title: translation?.title || post.post_id,
    excerpt: translation?.excerpt || '',
    slug: slug || null,
    language,
    url_path: slug ? `/${language}/blog/${slug}/` : null,
    moderation_notes: post.moderation_notes || null,
    reviewed_at: post.reviewed_at || null,
    reviewed_by: post.reviewed_by || null,
    review_flags: post.review_flags || null,
  };
};

module.exports = createCoreController(BLOG_POST_UID, ({ strapi }) => ({
  async createMyDraft(ctx) {
    if (!isTrue(process.env.UGC_POST_WRITE_ENABLED, false)) {
      return ctx.forbidden('UGC post write is disabled.');
    }

    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const payload = parsePayload(ctx);
    const communitySettings = await getCommunitySettings(strapi);
    if (!communitySettings.ugc_enabled) {
      return ctx.forbidden('UGC is disabled.');
    }
    const canonicalLanguage = normalizeLanguage(payload.language || payload.canonical_language || 'en');
    const title = sanitizeText(payload.title, 160);
    if (!title) return ctx.badRequest('title is required.');

    const slug = normalizeSlug(payload.slug || title);
    if (!slug) return ctx.badRequest('slug is invalid.');

    const postId = generatePostId();
    const excerpt = sanitizeText(payload.excerpt, 320);
    const body = sanitizeText(payload.body, 200000);
    const linkPolicy = validatePostLinkPolicy(body, communitySettings);
    if (!linkPolicy.ok) {
      return ctx.badRequest(linkPolicy.message);
    }
    const tags = Array.isArray(payload.tags) ? payload.tags.slice(0, 30) : [];
    const relatedPlaceRefs = Array.isArray(payload.related_place_refs) ? payload.related_place_refs.slice(0, 80) : [];

    const created = await strapi.entityService.create(BLOG_POST_UID, {
      data: {
        post_id: postId,
        canonical_language: canonicalLanguage,
        original_language: canonicalLanguage,
        translations: [
          {
            language: canonicalLanguage,
            status: 'draft',
            title,
            slug,
            excerpt,
            body,
            runtime_translation: false,
            indexable: false,
            canonical_path: `/${canonicalLanguage}/blog/${slug}/`,
          },
        ],
        tags,
        related_place_refs: relatedPlaceRefs,
        content_source: 'user',
        owner_user: Number(user.id),
        owner_user_id: Number(user.id),
        owner_username_snapshot: sanitizeText(user.username || '', 160) || `user-${user.id}`,
        submission_state: 'draft',
        site_visibility: 'visible',
        moderation_notes: null,
        reviewed_at: null,
        reviewed_by: null,
        review_flags: null,
        revision_enabled: true,
        mock: false,
      },
      populate: {
        translations: true,
      },
    });

    ctx.body = {
      data: toPostSummary(created, canonicalLanguage),
    };

    await createRevision(strapi, {
      post: created,
      action: 'create',
      changedBy: user.id,
    });
  },

  async updateMyDraft(ctx) {
    if (!isTrue(process.env.UGC_POST_WRITE_ENABLED, false)) {
      return ctx.forbidden('UGC post write is disabled.');
    }

    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const postId = sanitizeText(ctx.params?.postId || '', 200);
    if (!postId) return ctx.badRequest('postId is required.');

    const post = await findPostByPostId(strapi, postId, {
      content_source: 'user',
    });
    if (!post) return ctx.notFound('Draft not found.');
    if (Number(post.owner_user_id || 0) !== Number(user.id)) {
      return ctx.forbidden('You can only edit your own draft.');
    }

    if (!['draft', 'rejected'].includes(String(post.submission_state || '').toLowerCase())) {
      return ctx.badRequest('Only draft/rejected posts can be edited.');
    }

    const payload = parsePayload(ctx);
    const communitySettings = await getCommunitySettings(strapi);
    const language = normalizeLanguage(payload.language || payload.canonical_language || post.canonical_language || 'en');
    const nextTitle = sanitizeText(payload.title, 160);
    const nextSlug = normalizeSlug(payload.slug || nextTitle || pickTranslation(post, language)?.slug || '');
    const nextExcerpt = sanitizeText(payload.excerpt, 320);
    const nextBody = sanitizeText(payload.body, 200000);
    const linkPolicy = validatePostLinkPolicy(nextBody, communitySettings);
    if (!linkPolicy.ok) {
      return ctx.badRequest(linkPolicy.message);
    }
    const nextStatus =
      ['draft', 'complete'].includes(String(payload.translation_status || '').toLowerCase())
        ? String(payload.translation_status).toLowerCase()
        : 'draft';

    const existingTranslation = pickTranslation(post, language) || {};
    const mergedTranslations = upsertTranslation(post.translations, language, {
      language,
      status: nextStatus,
      title: nextTitle || existingTranslation.title || '',
      slug: nextSlug || existingTranslation.slug || '',
      excerpt: nextExcerpt || existingTranslation.excerpt || '',
      body: nextBody || existingTranslation.body || '',
      runtime_translation: false,
      indexable: false,
      canonical_path:
        nextSlug || existingTranslation.slug
          ? `/${language}/blog/${nextSlug || existingTranslation.slug}/`
          : existingTranslation.canonical_path || null,
    });

    const tags = Array.isArray(payload.tags) ? payload.tags.slice(0, 30) : post.tags || [];
    const relatedPlaceRefs = Array.isArray(payload.related_place_refs)
      ? payload.related_place_refs.slice(0, 80)
      : post.related_place_refs || [];

    const updated = await strapi.entityService.update(BLOG_POST_UID, Number(post.id), {
      data: {
        canonical_language: normalizeLanguage(payload.canonical_language || post.canonical_language || language),
        original_language: normalizeLanguage(post.original_language || post.canonical_language || language),
        translations: mergedTranslations,
        tags,
        related_place_refs: relatedPlaceRefs,
        owner_username_snapshot: sanitizeText(user.username || post.owner_username_snapshot || '', 160),
        submission_state: 'draft',
        site_visibility: normalizeSiteVisibility(post.site_visibility || 'visible'),
      },
      populate: {
        translations: true,
      },
    });

    ctx.body = {
      data: toPostSummary(updated, language),
    };

    await createRevision(strapi, {
      post: updated,
      action: 'update',
      changedBy: user.id,
    });
  },

  async submitMyDraft(ctx) {
    if (!isTrue(process.env.UGC_POST_WRITE_ENABLED, false)) {
      return ctx.forbidden('UGC post write is disabled.');
    }

    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const postId = sanitizeText(ctx.params?.postId || '', 200);
    if (!postId) return ctx.badRequest('postId is required.');

    const post = await findPostByPostId(strapi, postId, {
      content_source: 'user',
    });
    if (!post) return ctx.notFound('Draft not found.');
    if (Number(post.owner_user_id || 0) !== Number(user.id)) {
      return ctx.forbidden('You can only submit your own draft.');
    }

    if (!['draft', 'rejected'].includes(String(post.submission_state || '').toLowerCase())) {
      return ctx.badRequest('Only draft/rejected posts can be submitted.');
    }

    const canonicalLanguage = normalizeLanguage(post.canonical_language || 'en');
    const canonicalTranslation = pickTranslation(post, canonicalLanguage);
    const title = sanitizeText(canonicalTranslation?.title || '', 160);
    const slug = normalizeSlug(canonicalTranslation?.slug || '');
    if (!title || !slug) {
      return ctx.badRequest('Canonical translation title and slug are required before submit.');
    }

    const updated = await strapi.entityService.update(BLOG_POST_UID, Number(post.id), {
      data: {
        submission_state: 'submitted',
        site_visibility: 'visible',
        moderation_notes: null,
      },
      populate: {
        translations: true,
      },
    });

    ctx.body = {
      data: toPostSummary(updated, canonicalLanguage),
    };

    await createRevision(strapi, {
      post: updated,
      action: 'submit',
      changedBy: user.id,
    });
  },

  async myList(ctx) {
    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const status = normalizeSubmissionState(ctx.query?.state);
    if (String(ctx.query?.state || '').trim() && !status) {
      return ctx.badRequest('state is invalid.');
    }

    const limit = parseLimit(ctx.query?.limit, 30, 1, 200);
    const preferredLanguage = normalizeLanguage(ctx.query?.lang || 'en');

    const filters = {
      content_source: 'user',
      owner_user_id: Number(user.id),
    };
    if (status) filters.submission_state = status;

    const posts = await strapi.entityService.findMany(BLOG_POST_UID, {
      publicationState: 'preview',
      filters,
      fields: [
        'post_id',
        'canonical_language',
        'original_language',
        'content_source',
        'submission_state',
        'site_visibility',
        'owner_user_id',
        'owner_username_snapshot',
        'published_on',
        'publishedAt',
        'moderation_notes',
        'reviewed_at',
        'reviewed_by',
        'review_flags',
        'mock',
      ],
      populate: {
        translations: true,
      },
      sort: ['updatedAt:desc'],
      limit,
    });

    ctx.body = {
      data: Array.isArray(posts) ? posts.map((entry) => toPostSummary(entry, preferredLanguage)) : [],
    };
  },

  async setMyVisibility(ctx) {
    if (!isTrue(process.env.UGC_POST_WRITE_ENABLED, false)) {
      return ctx.forbidden('UGC post write is disabled.');
    }

    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const postId = sanitizeText(ctx.params?.postId || '', 200);
    if (!postId) return ctx.badRequest('postId is required.');

    const post = await findPostByPostId(strapi, postId, {
      content_source: 'user',
    });
    if (!post) return ctx.notFound('Post not found.');
    if (Number(post.owner_user_id || 0) !== Number(user.id)) {
      return ctx.forbidden('You can only edit your own post visibility.');
    }

    const state = normalizeSubmissionState(post.submission_state || '');
    if (!['submitted', 'approved'].includes(state || '')) {
      return ctx.badRequest('Only submitted/approved posts can change visibility.');
    }

    const payload = parsePayload(ctx);
    const visibleRaw = payload.visible;
    if (visibleRaw === undefined || visibleRaw === null) {
      return ctx.badRequest('visible is required.');
    }
    const visible = ['1', 'true', 'yes', 'on'].includes(String(visibleRaw).trim().toLowerCase());
    const nextVisibility = visible ? 'visible' : 'hidden';

    const updated = await strapi.entityService.update(BLOG_POST_UID, Number(post.id), {
      data: {
        site_visibility: nextVisibility,
      },
      populate: {
        translations: true,
      },
    });

    ctx.body = {
      data: toPostSummary(updated, normalizeLanguage(payload.lang || updated.canonical_language || 'en')),
    };

    await createRevision(strapi, {
      post: updated,
      action: 'visibility',
      changedBy: user.id,
    });
  },

  async moderationList(ctx) {
    const identity = await resolveModerationIdentity(strapi, ctx);
    if (!identity?.canModerate) return ctx.forbidden('Moderation access denied.');

    const state = normalizeSubmissionState(ctx.query?.state || 'submitted') || 'submitted';
    const limit = parseLimit(ctx.query?.limit, 40, 1, 200);
    const preferredLanguage = normalizeLanguage(ctx.query?.lang || 'en');

    const filters = {
      content_source: 'user',
      submission_state: state,
    };

    const posts = await strapi.entityService.findMany(BLOG_POST_UID, {
      publicationState: 'preview',
      filters,
      fields: [
        'post_id',
        'canonical_language',
        'original_language',
        'content_source',
        'submission_state',
        'site_visibility',
        'owner_user_id',
        'owner_username_snapshot',
        'published_on',
        'publishedAt',
        'moderation_notes',
        'reviewed_at',
        'reviewed_by',
        'review_flags',
        'mock',
      ],
      populate: {
        translations: true,
      },
      sort: ['updatedAt:asc'],
      limit,
    });

    ctx.body = {
      data: Array.isArray(posts) ? posts.map((entry) => toPostSummary(entry, preferredLanguage)) : [],
    };
  },

  async moderationSet(ctx) {
    const identity = await resolveModerationIdentity(strapi, ctx);
    if (!identity?.canModerate) return ctx.forbidden('Moderation access denied.');

    const payload = parsePayload(ctx);
    const postId = sanitizeText(payload.post_id || '', 200);
    if (!postId) return ctx.badRequest('post_id is required.');

    const nextState = normalizeSubmissionState(payload.next_state);
    if (!nextState || !MODERATION_TARGET_STATES.has(nextState)) {
      return ctx.badRequest('next_state is invalid.');
    }

    const moderationNotesRaw = sanitizeText(payload.moderation_notes || '', 2000);
    if (['rejected', 'spam', 'deleted'].includes(nextState) && moderationNotesRaw.length < 5) {
      return ctx.badRequest('moderation_notes is required (minimum 5 chars) for reject/spam/delete.');
    }

    const post = await findPostByPostId(strapi, postId, {
      content_source: 'user',
    });
    if (!post) return ctx.notFound('Post not found.');

    const nowIso = new Date().toISOString();
    const nowDate = nowIso.slice(0, 10);
    let translations = Array.isArray(post.translations) ? post.translations.slice() : [];

    if (nextState === 'approved') {
      const canonicalLanguage = normalizeLanguage(post.canonical_language || 'en');
      const canonicalTranslation = pickTranslation(post, canonicalLanguage);
      const title = sanitizeText(canonicalTranslation?.title || '', 160);
      const slug = normalizeSlug(canonicalTranslation?.slug || '');
      if (!title || !slug) {
        return ctx.badRequest('Approved posts require canonical translation title and slug.');
      }

      translations = upsertTranslation(translations, canonicalLanguage, {
        language: canonicalLanguage,
        title,
        slug,
        status: canonicalLanguage === 'en' ? 'complete' : canonicalTranslation?.status || 'draft',
        indexable: canonicalLanguage === 'en',
        runtime_translation: false,
        canonical_path: `/${canonicalLanguage}/blog/${slug}/`,
      });
    }

    const data = {
      submission_state: nextState,
      moderation_notes: moderationNotesRaw || null,
      reviewed_at: nowIso,
      reviewed_by: Number(identity.user.id),
      translations,
      site_visibility: normalizeSiteVisibility(post.site_visibility || 'visible'),
    };

    if (nextState === 'approved') {
      data.publishedAt = post.publishedAt || nowIso;
      data.published_on = post.published_on || nowDate;
      data.review_flags = null;
    } else {
      data.publishedAt = null;
      data.published_on = null;
      data.site_visibility = 'hidden';
    }

    const updated = await strapi.entityService.update(BLOG_POST_UID, Number(post.id), {
      data,
      populate: {
        translations: true,
      },
    });

    await writeAuditLog(strapi, {
      actor: resolveActorFromIdentity({
        user: identity.user,
        roleRaw: identity.user?.role?.type || identity.user?.role?.name || '',
      }),
      action: 'moderation.blog_post.set',
      targetType: 'blog-post',
      targetRef: updated.post_id,
      payload: {
        from_state: post.submission_state || null,
        to_state: updated.submission_state || null,
        site_visibility: updated.site_visibility || null,
      },
    });

    ctx.body = {
      data: toPostSummary(updated, normalizeLanguage(payload.lang || updated.canonical_language || 'en')),
    };

    await createRevision(strapi, {
      post: updated,
      action: 'moderate',
      changedBy: identity.user.id,
    });
  },
}));
