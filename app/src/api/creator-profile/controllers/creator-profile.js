'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { authenticateFromBearer } = require('../../../modules/blog-engagement/auth');

const PROFILE_UID = 'api::creator-profile.creator-profile';
const BLOG_POST_UID = 'api::blog-post.blog-post';
const USER_UID = 'plugin::users-permissions.user';

const BLOG_LANGUAGES = new Set(['en', 'tr', 'de', 'es', 'ru', 'zh-cn']);
const ACCENT_COLORS = new Set(['ocean', 'coral', 'moss', 'slate', 'sand', 'plum']);
const VISIBILITY_SET = new Set(['public', 'members', 'private']);

const isTrue = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const normalizeUsername = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const normalizeLanguage = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return BLOG_LANGUAGES.has(normalized) ? normalized : 'en';
};

const normalizeVisibility = (value, fallback = 'public') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return VISIBILITY_SET.has(normalized) ? normalized : fallback;
};

const normalizeAccentColor = (value, fallback = 'ocean') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return ACCENT_COLORS.has(normalized) ? normalized : fallback;
};

const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

  const firstComplete = translations.find((entry) => entry?.status === 'complete');
  if (firstComplete) return firstComplete;

  return preferred || translations[0] || null;
};

const isPublishedApprovedUserPost = (post) =>
  post?.content_source === 'user' &&
  post?.submission_state === 'approved' &&
  Boolean(post?.publishedAt) &&
  post?.mock !== true;

const extractAvatar = (avatar) => {
  if (!avatar) return null;
  const media = Array.isArray(avatar) ? avatar[0] : avatar;
  if (!media || typeof media !== 'object') return null;
  return {
    id: media.id || null,
    url: media.url || null,
    alternativeText: media.alternativeText || null,
    width: media.width || null,
    height: media.height || null,
    formats: media.formats || null,
  };
};

const toPublicProfile = (profile, stats = null) => ({
  username: profile.username,
  display_name: profile.display_name,
  bio: profile.bio || null,
  accent_color: normalizeAccentColor(profile.accent_color),
  visibility: normalizeVisibility(profile.visibility),
  citizen_card_enabled: profile.citizen_card_enabled !== false,
  social_links: profile.social_links || null,
  avatar: extractAvatar(profile.avatar),
  stats: stats || {
    posts_count: 0,
    countries_count: 0,
    cities_count: 0,
  },
  links: {
    profile: `/u/${profile.username}/`,
    posts: `/u/${profile.username}/posts/`,
    about: `/u/${profile.username}/about/`,
  },
});

const computeCitizenStats = (posts = []) => {
  const countries = new Set();
  const cities = new Set();

  for (const post of posts) {
    const places = Array.isArray(post?.related_places) ? post.related_places : [];
    for (const place of places) {
      const placeId = String(place?.place_id || '').trim();
      if (!placeId) continue;
      const placeType = String(place?.place_type || '').trim().toLowerCase();
      if (placeType === 'country') {
        countries.add(placeId);
      } else if (['locality', 'city', 'admin2', 'admin3'].includes(placeType)) {
        cities.add(placeId);
      }
    }
  }

  return {
    posts_count: posts.length,
    countries_count: countries.size,
    cities_count: cities.size,
  };
};

const normalizeSocialLinks = (value) => {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) return value.slice(0, 12);
  return value;
};

const parseProfilePayload = (ctx) => {
  const payload = ctx.request?.body?.data || ctx.request?.body || {};
  const usernameRaw = normalizeUsername(payload.username);
  const username = usernameRaw.length >= 3 ? usernameRaw : null;
  const displayNameRaw = String(payload.display_name || '').trim();
  const displayName = displayNameRaw.length > 0 ? displayNameRaw.slice(0, 120) : null;
  const bioRaw = String(payload.bio || '').trim();
  const bio = bioRaw.length > 0 ? bioRaw.slice(0, 2000) : null;

  return {
    username,
    display_name: displayName,
    bio,
    accent_color: normalizeAccentColor(payload.accent_color, 'ocean'),
    visibility: normalizeVisibility(payload.visibility, 'public'),
    citizen_card_enabled: payload.citizen_card_enabled === undefined ? true : Boolean(payload.citizen_card_enabled),
    social_links: normalizeSocialLinks(payload.social_links),
  };
};

const parseLimit = (value, fallback = 24, min = 1, max = 100) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

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

const findProfileByUsername = async (strapi, username) => {
  const entries = await strapi.entityService.findMany(PROFILE_UID, {
    filters: { username },
    fields: [
      'username',
      'display_name',
      'bio',
      'accent_color',
      'visibility',
      'citizen_card_enabled',
      'social_links',
      'owner_user_id',
    ],
    populate: {
      avatar: {
        fields: ['url', 'alternativeText', 'width', 'height', 'formats'],
      },
    },
    limit: 1,
  });
  return entries[0] || null;
};

module.exports = createCoreController(PROFILE_UID, ({ strapi }) => ({
  async findPublicList(ctx) {
    if (!isTrue(process.env.UGC_PROFILE_PUBLIC_ENABLED, true)) {
      ctx.body = { data: [] };
      return;
    }

    const limit = parseLimit(ctx.query?.limit, 300, 1, 1000);
    const rows = await strapi.entityService.findMany(PROFILE_UID, {
      filters: {
        visibility: 'public',
      },
      fields: [
        'username',
        'display_name',
        'bio',
        'accent_color',
        'visibility',
        'citizen_card_enabled',
        'social_links',
        'owner_user_id',
      ],
      populate: {
        avatar: {
          fields: ['url', 'alternativeText', 'width', 'height', 'formats'],
        },
      },
      sort: ['username:asc'],
      limit,
    });

    ctx.body = {
      data: (Array.isArray(rows) ? rows : []).map((entry) => toPublicProfile(entry)),
    };
  },

  async findPublicByUsername(ctx) {
    if (!isTrue(process.env.UGC_PROFILE_PUBLIC_ENABLED, true)) {
      return ctx.notFound('Creator profiles are disabled.');
    }

    const username = normalizeUsername(ctx.params?.username);
    if (!username) return ctx.badRequest('username is required.');

    const profile = await findProfileByUsername(strapi, username);
    if (!profile || normalizeVisibility(profile.visibility) !== 'public') {
      return ctx.notFound('Creator not found.');
    }

    const posts = await strapi.entityService.findMany(BLOG_POST_UID, {
      publicationState: 'live',
      filters: {
        content_source: 'user',
        owner_user_id: profile.owner_user_id,
        submission_state: 'approved',
        mock: false,
      },
      fields: ['id'],
      populate: {
        related_places: {
          fields: ['place_id', 'place_type'],
        },
      },
      limit: 200,
    });

    ctx.body = {
      data: toPublicProfile(profile, computeCitizenStats(Array.isArray(posts) ? posts : [])),
    };
  },

  async findPublicPosts(ctx) {
    if (!isTrue(process.env.UGC_PROFILE_PUBLIC_ENABLED, true)) {
      return ctx.notFound('Creator profiles are disabled.');
    }

    const username = normalizeUsername(ctx.params?.username);
    if (!username) return ctx.badRequest('username is required.');

    const profile = await findProfileByUsername(strapi, username);
    if (!profile || normalizeVisibility(profile.visibility) !== 'public') {
      return ctx.notFound('Creator not found.');
    }

    const preferredLanguage = normalizeLanguage(ctx.query?.lang || 'en');
    const limit = parseLimit(ctx.query?.limit, 24, 1, 120);

    const posts = await strapi.entityService.findMany(BLOG_POST_UID, {
      publicationState: 'live',
      filters: {
        content_source: 'user',
        owner_user_id: profile.owner_user_id,
        submission_state: 'approved',
        mock: false,
      },
      fields: [
        'post_id',
        'canonical_language',
        'published_on',
        'content_source',
        'submission_state',
        'mock',
        'publishedAt',
        'owner_username_snapshot',
      ],
      populate: {
        translations: true,
      },
      sort: ['published_on:desc', 'createdAt:desc'],
      limit,
    });

    const rows = (Array.isArray(posts) ? posts : [])
      .filter((entry) => isPublishedApprovedUserPost(entry))
      .map((entry) => {
        const translation = pickTranslation(entry, preferredLanguage);
        const slug = String(translation?.slug || '').trim();
        const language = normalizeLanguage(translation?.language || entry.canonical_language || 'en');
        const urlPath = slug ? `/${language}/blog/${slug}/` : null;

        return {
          post_id: entry.post_id,
          title: translation?.title || entry.post_id,
          excerpt: translation?.excerpt || '',
          slug: slug || null,
          language,
          canonical_language: normalizeLanguage(entry.canonical_language || 'en'),
          published_on: entry.published_on || null,
          url_path: urlPath,
        };
      })
      .filter((entry) => Boolean(entry.slug));

    ctx.body = {
      data: {
        profile: toPublicProfile(profile),
        posts: rows,
      },
    };
  },

  async me(ctx) {
    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const records = await strapi.entityService.findMany(PROFILE_UID, {
      filters: { owner_user_id: Number(user.id) },
      fields: [
        'username',
        'display_name',
        'bio',
        'accent_color',
        'visibility',
        'citizen_card_enabled',
        'social_links',
        'owner_user_id',
      ],
      populate: {
        avatar: {
          fields: ['url', 'alternativeText', 'width', 'height', 'formats'],
        },
      },
      limit: 1,
    });
    const profile = records[0] || null;

    if (!profile) {
      ctx.body = { data: null };
      return;
    }

    ctx.body = {
      data: toPublicProfile(profile),
    };
  },

  async upsertMe(ctx) {
    const user = await resolveAuthUser(strapi, ctx);
    if (!user) return ctx.unauthorized('Authentication required.');

    const parsed = parseProfilePayload(ctx);
    const existingRecords = await strapi.entityService.findMany(PROFILE_UID, {
      filters: { owner_user_id: Number(user.id) },
      fields: ['id', 'username'],
      limit: 1,
    });
    const existing = existingRecords[0] || null;

    const username = parsed.username || normalizeUsername(existing?.username || user.username || `user-${user.id}`);
    if (!username || username.length < 3) {
      return ctx.badRequest('username is required and must be at least 3 characters.');
    }

    const duplicate = await strapi.entityService.findMany(PROFILE_UID, {
      filters: existing?.id
        ? {
            username,
            id: { $ne: Number(existing.id) },
          }
        : { username },
      fields: ['id'],
      limit: 1,
    });
    if (duplicate[0]?.id) {
      return ctx.badRequest('username is already taken.');
    }

    const data = {
      owner_user: Number(user.id),
      owner_user_id: Number(user.id),
      username,
      display_name: parsed.display_name || String(user.username || username).slice(0, 120),
      bio: parsed.bio,
      accent_color: parsed.accent_color,
      visibility: parsed.visibility,
      citizen_card_enabled: parsed.citizen_card_enabled,
      social_links: parsed.social_links,
    };

    const profile = existing?.id
      ? await strapi.entityService.update(PROFILE_UID, Number(existing.id), { data })
      : await strapi.entityService.create(PROFILE_UID, { data });

    ctx.body = {
      data: toPublicProfile(profile),
    };
  },
}));
