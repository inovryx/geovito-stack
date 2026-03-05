'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');

const USER_UID = 'plugin::users-permissions.user';
const ROLE_UID = 'plugin::users-permissions.role';
const PROFILE_UID = 'api::creator-profile.creator-profile';
const BLOG_POST_UID = 'api::blog-post.blog-post';
const PLACE_UID = 'api::atlas-place.atlas-place';

const ALLOWED_LANGS = new Set(['en', 'tr', 'de', 'es', 'ru', 'zh-cn']);
const ALLOWED_STATES = new Set(['draft', 'submitted', 'approved', 'rejected', 'spam', 'deleted']);

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

const normalizeSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const normalizeLanguage = (value, fallback = 'en') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return ALLOWED_LANGS.has(normalized) ? normalized : fallback;
};

const normalizeState = (value, fallback = 'approved') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return ALLOWED_STATES.has(normalized) ? normalized : fallback;
};

const sanitizeText = (value, maxLength = 5000) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
};

const readEnv = (key, fallback = '') => {
  const value = String(process.env[key] || '').trim();
  return value || fallback;
};

const createStrapiApp = async () => {
  const app = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });
  await app.load();
  return app;
};

const getAuthenticatedRoleId = async (strapi) => {
  const role = await strapi.db.query(ROLE_UID).findOne({
    where: { type: 'authenticated' },
    select: ['id'],
  });
  return Number(role?.id || 0) || null;
};

const findOwnerUser = async (strapi, ownerEmail, ownerUsername) => {
  if (ownerEmail) {
    const byEmail = await strapi.db.query(USER_UID).findOne({
      where: { email: ownerEmail },
      select: ['id', 'username', 'email', 'confirmed', 'blocked'],
    });
    if (byEmail) return byEmail;
  }

  if (ownerUsername) {
    const byUsername = await strapi.db.query(USER_UID).findOne({
      where: { username: ownerUsername },
      select: ['id', 'username', 'email', 'confirmed', 'blocked'],
    });
    if (byUsername) return byUsername;
  }

  return null;
};

const createOwnerUserIfNeeded = async (strapi, cfg) => {
  const ownerEmail = cfg.ownerEmail;
  const ownerUsername = cfg.ownerUsername;
  if (!cfg.createOwnerIfMissing || !ownerEmail || !ownerUsername) return null;

  const authRoleId = await getAuthenticatedRoleId(strapi);
  if (!authRoleId) {
    throw new Error('users-permissions authenticated role not found');
  }

  const user = await strapi.plugin('users-permissions').service('user').add({
    username: ownerUsername,
    email: ownerEmail,
    password: cfg.ownerPassword,
    provider: 'local',
    confirmed: true,
    blocked: false,
    role: authRoleId,
  });

  return {
    id: Number(user.id),
    username: user.username,
    email: user.email,
    confirmed: Boolean(user.confirmed),
    blocked: Boolean(user.blocked),
  };
};

const findProfileByUsername = async (strapi, username) => {
  const rows = await strapi.entityService.findMany(PROFILE_UID, {
    filters: { username },
    fields: ['id', 'username', 'display_name', 'owner_user_id', 'visibility'],
    populate: {
      owner_user: {
        fields: ['id', 'username', 'email'],
      },
    },
    limit: 1,
  });
  return rows[0] || null;
};

const upsertProfile = async (strapi, cfg, ownerUser) => {
  const profile = await findProfileByUsername(strapi, cfg.creatorUsername);
  if (!profile) {
    if (!ownerUser?.id) {
      throw new Error(
        `creator profile (${cfg.creatorUsername}) not found and owner user could not be resolved; pass SHOWCASE_OWNER_EMAIL`
      );
    }

    const created = await strapi.entityService.create(PROFILE_UID, {
      data: {
        owner_user: Number(ownerUser.id),
        owner_user_id: Number(ownerUser.id),
        username: cfg.creatorUsername,
        display_name: cfg.creatorDisplayName,
        bio: cfg.creatorBio,
        accent_color: cfg.creatorAccentColor,
        visibility: cfg.creatorVisibility,
        citizen_card_enabled: true,
      },
    });
    return {
      profile: created,
      action: 'created',
      ownerMismatch: false,
    };
  }

  const currentOwnerId = Number(profile.owner_user_id || 0);
  const nextOwnerId = Number(ownerUser?.id || 0);
  const ownerMismatch = Boolean(nextOwnerId && currentOwnerId && currentOwnerId !== nextOwnerId);

  if (ownerMismatch && cfg.reassignProfileOwner) {
    const updated = await strapi.entityService.update(PROFILE_UID, Number(profile.id), {
      data: {
        owner_user: nextOwnerId,
        owner_user_id: nextOwnerId,
      },
    });
    return {
      profile: updated,
      action: 'owner_reassigned',
      ownerMismatch: false,
    };
  }

  return {
    profile,
    action: 'existing',
    ownerMismatch,
  };
};

const findPilotPlace = async (strapi, placeId) => {
  const rows = await strapi.entityService.findMany(PLACE_UID, {
    publicationState: 'preview',
    filters: {
      place_id: placeId,
    },
    fields: ['id', 'place_id', 'place_type', 'country_code', 'mock'],
    limit: 1,
  });
  return rows[0] || null;
};

const buildShowcasePosts = (cfg, profileUsername) => {
  const usernamePrefix = normalizeSlug(profileUsername);

  const post1Slug = `${usernamePrefix}-first-place-italy-pilot`;
  const post2SlugEn = `${usernamePrefix}-rome-weekend-routes`;
  const post2SlugTr = `${usernamePrefix}-roma-hafta-sonu-rotalari`;
  const post3Slug = `${usernamePrefix}-budget-city-break-checklist`;

  return [
    {
      key: 'first-place',
      postId: `ugc-${usernamePrefix}-first-place`,
      state: 'submitted',
      siteVisibility: 'visible',
      canonicalLanguage: 'en',
      originalLanguage: 'en',
      tags: ['first-post', 'italy', 'in-review'],
      translationEntries: [
        {
          language: 'en',
          status: 'complete',
          title: 'My First Place Note: Italy Pilot',
          slug: post1Slug,
          excerpt: 'First community note linked to Italy pilot place. Pending moderation review.',
          body: '<p>I started by mapping one country page and writing what helped me most during planning.</p><p>This draft is visible for community context and stays in review until moderation approval.</p>',
          runtime_translation: false,
          indexable: false,
          canonical_path: `/en/blog/${post1Slug}/`,
        },
      ],
      moderationNotes: 'Seeded showcase post (in review)',
    },
    {
      key: 'weekend-routes',
      postId: `ugc-${usernamePrefix}-weekend-routes`,
      state: 'approved',
      siteVisibility: 'visible',
      canonicalLanguage: 'en',
      originalLanguage: 'tr',
      tags: ['weekend', 'routes', 'italy'],
      translationEntries: [
        {
          language: 'en',
          status: 'complete',
          title: '48 Hours in Italy Pilot: Route Blocks',
          slug: post2SlugEn,
          excerpt: 'A compact route plan with practical blocks for transport, food and walking.',
          body: '<p>This approved sample shows a mixed-language post where original writing started in Turkish.</p><p>Use route blocks to avoid over-scheduling and keep city transitions simple.</p>',
          runtime_translation: false,
          indexable: true,
          canonical_path: `/en/blog/${post2SlugEn}/`,
        },
        {
          language: 'tr',
          status: 'complete',
          title: 'Italya Pilot Icin 48 Saat: Rota Bloklari',
          slug: post2SlugTr,
          excerpt: 'Ulasim, yemek ve yurume odakli kompakt rota plani.',
          body: '<p>Bu onayli ornek, orijinal dili Turkce olan bir yazinin EN canonical ile yayinlanmasini gosterir.</p><p>Rota bloklari ile gun icinde gecisleri sade tutabilirsiniz.</p>',
          runtime_translation: false,
          indexable: false,
          canonical_path: `/tr/blog/${post2SlugTr}/`,
        },
      ],
      moderationNotes: 'Approved showcase post',
    },
    {
      key: 'budget-checklist',
      postId: `ugc-${usernamePrefix}-budget-checklist`,
      state: 'approved',
      siteVisibility: 'visible',
      canonicalLanguage: 'en',
      originalLanguage: 'en',
      tags: ['budget', 'checklist', 'planning'],
      translationEntries: [
        {
          language: 'en',
          status: 'complete',
          title: 'Budget City Break Checklist (Pilot)',
          slug: post3Slug,
          excerpt: 'Template checklist for transport, accommodation and daily spend control.',
          body: '<p>This approved sample is designed for repeatable planning.</p><p>Track fixed costs first, then distribute variable spend by district and time block.</p>',
          runtime_translation: false,
          indexable: true,
          canonical_path: `/en/blog/${post3Slug}/`,
        },
      ],
      moderationNotes: 'Approved showcase post',
    },
  ];
};

const findPostByPostId = async (strapi, postId) => {
  const rows = await strapi.entityService.findMany(BLOG_POST_UID, {
    publicationState: 'preview',
    filters: { post_id: postId },
    fields: ['id', 'post_id', 'submission_state', 'publishedAt', 'site_visibility'],
    limit: 1,
  });
  return rows[0] || null;
};

const toPostPayload = (cfg, ownerUserId, ownerUsername, postDef, place) => {
  const state = normalizeState(postDef.state, 'approved');
  const isApproved = state === 'approved';
  const nowIso = new Date().toISOString();
  const publishedDate = nowIso.slice(0, 10);

  return {
    post_id: postDef.postId,
    canonical_language: normalizeLanguage(postDef.canonicalLanguage, 'en'),
    original_language: normalizeLanguage(postDef.originalLanguage, 'en'),
    translations: postDef.translationEntries.map((entry) => ({
      language: normalizeLanguage(entry.language, 'en'),
      status: String(entry.status || 'draft').toLowerCase(),
      title: sanitizeText(entry.title, 160),
      slug: normalizeSlug(entry.slug),
      excerpt: sanitizeText(entry.excerpt, 220),
      body: sanitizeText(entry.body, 5000),
      runtime_translation: Boolean(entry.runtime_translation),
      indexable: Boolean(entry.indexable),
      canonical_path: sanitizeText(entry.canonical_path, 220),
    })),
    tags: Array.isArray(postDef.tags) ? postDef.tags.slice(0, 16) : [],
    related_place_refs: place
      ? [
          {
            place_id: place.place_id,
            place_type: place.place_type,
            country_code: place.country_code,
          },
        ]
      : [],
    related_places: place ? [Number(place.id)] : [],
    content_source: 'user',
    owner_user: Number(ownerUserId),
    owner_user_id: Number(ownerUserId),
    owner_username_snapshot: ownerUsername,
    submission_state: state,
    site_visibility: postDef.siteVisibility === 'hidden' ? 'hidden' : 'visible',
    moderation_notes: sanitizeText(postDef.moderationNotes, 600) || null,
    reviewed_at: isApproved ? nowIso : null,
    reviewed_by: isApproved ? Number(ownerUserId) : null,
    review_flags: isApproved ? null : { in_review: true, seed: true },
    revision_enabled: true,
    mock: false,
    publishedAt: isApproved ? nowIso : null,
    published_on: isApproved ? publishedDate : null,
  };
};

const upsertUserPost = async (strapi, payload) => {
  const existing = await findPostByPostId(strapi, payload.post_id);
  if (existing?.id) {
    const updated = await strapi.entityService.update(BLOG_POST_UID, Number(existing.id), {
      data: payload,
    });
    return {
      action: 'updated',
      id: Number(updated.id),
      postId: payload.post_id,
      submissionState: payload.submission_state,
      slug: payload.translations?.[0]?.slug || null,
    };
  }

  const created = await strapi.entityService.create(BLOG_POST_UID, {
    data: payload,
  });
  return {
    action: 'created',
    id: Number(created.id),
    postId: payload.post_id,
    submissionState: payload.submission_state,
    slug: payload.translations?.[0]?.slug || null,
  };
};

const run = async () => {
  const cfg = {
    creatorUsername: normalizeUsername(readEnv('SHOWCASE_CREATOR_USERNAME', 'olmysweet')),
    creatorDisplayName: sanitizeText(readEnv('SHOWCASE_CREATOR_DISPLAY_NAME', 'Olmysweet'), 120),
    creatorBio: sanitizeText(
      readEnv(
        'SHOWCASE_CREATOR_BIO',
        'Community writer profile used for first-place and first-post showcase content.'
      ),
      500
    ),
    creatorAccentColor: readEnv('SHOWCASE_CREATOR_ACCENT_COLOR', 'ocean').toLowerCase(),
    creatorVisibility: readEnv('SHOWCASE_CREATOR_VISIBILITY', 'public').toLowerCase(),
    ownerEmail: readEnv('SHOWCASE_OWNER_EMAIL', 'ali.koc.00@gmail.com').toLowerCase(),
    ownerUsername: normalizeUsername(readEnv('SHOWCASE_OWNER_USERNAME', 'olmysweet')),
    ownerPassword: readEnv('SHOWCASE_OWNER_PASSWORD', '123456'),
    createOwnerIfMissing: isTrue(process.env.SHOWCASE_CREATE_OWNER_IF_MISSING, false),
    reassignProfileOwner: isTrue(process.env.SHOWCASE_REASSIGN_PROFILE_OWNER, false),
    placeId: readEnv('SHOWCASE_PLACE_ID', 'country-it-pilot'),
  };

  if (!cfg.creatorUsername) {
    throw new Error('SHOWCASE_CREATOR_USERNAME is required');
  }

  let strapi;
  try {
    console.log('==============================================================');
    console.log('GEOVITO UGC SHOWCASE SEED');
    console.log(`creator_username=${cfg.creatorUsername}`);
    console.log(`owner_email=${cfg.ownerEmail || 'n/a'}`);
    console.log(`owner_username=${cfg.ownerUsername || 'n/a'}`);
    console.log(`reassign_profile_owner=${cfg.reassignProfileOwner}`);
    console.log(`place_id=${cfg.placeId}`);
    console.log('==============================================================');

    strapi = await createStrapiApp();

    let ownerUser = await findOwnerUser(strapi, cfg.ownerEmail, cfg.ownerUsername);
    if (!ownerUser) {
      ownerUser = await createOwnerUserIfNeeded(strapi, cfg);
      if (ownerUser) {
        console.log(`INFO: owner user created (id=${ownerUser.id} email=${ownerUser.email})`);
      }
    }
    if (!ownerUser) {
      throw new Error('owner user not found; set SHOWCASE_OWNER_EMAIL or enable SHOWCASE_CREATE_OWNER_IF_MISSING=true');
    }

    const profileResult = await upsertProfile(strapi, cfg, ownerUser);
    const profile = profileResult.profile;
    const profileOwnerId = Number(profile?.owner_user_id || ownerUser.id);
    const profileUsername = normalizeUsername(profile?.username || cfg.creatorUsername);
    if (!profileUsername) {
      throw new Error('resolved creator profile username is invalid');
    }

    if (profileResult.ownerMismatch) {
      console.log(
        `WARN: profile owner mismatch detected (profile owner_user_id=${profile.owner_user_id}, requested owner id=${ownerUser.id}).`
      );
      console.log('WARN: rerun with SHOWCASE_REASSIGN_PROFILE_OWNER=true to move ownership.');
    }

    const place = await findPilotPlace(strapi, cfg.placeId);
    if (place?.id) {
      console.log(`INFO: linked place found (${place.place_id}, id=${place.id})`);
    } else {
      console.log(`WARN: linked place not found (${cfg.placeId}); posts will be created without related_places relation.`);
    }

    const plan = buildShowcasePosts(cfg, profileUsername);
    const results = [];
    for (const postDef of plan) {
      const payload = toPostPayload(cfg, profileOwnerId, profileUsername, postDef, place);
      const result = await upsertUserPost(strapi, payload);
      results.push(result);
      console.log(
        `PASS: ${result.action} post (${result.postId}) state=${result.submissionState} slug=${result.slug || 'n/a'}`
      );
    }

    console.log('==============================================================');
    console.log(
      JSON.stringify(
        {
          ok: true,
          creator_profile: {
            id: Number(profile.id),
            username: profileUsername,
            owner_user_id: profileOwnerId,
            action: profileResult.action,
          },
          linked_place: place
            ? {
                id: Number(place.id),
                place_id: place.place_id,
                place_type: place.place_type,
              }
            : null,
          posts: results,
        },
        null,
        2
      )
    );
    console.log('==============================================================');
    console.log('UGC SHOWCASE SEED: PASS');
    console.log('==============================================================');
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (strapi) {
      try {
        await strapi.destroy();
      } catch (error) {
        const message = String(error?.message || '');
        if (!message.toLowerCase().includes('aborted')) {
          console.error(`FAIL: strapi shutdown error (${message || 'unknown'})`);
          process.exitCode = process.exitCode || 1;
        }
      }
    }
  }
  return process.exitCode || 0;
};

void run()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(`FAIL: ${String(error?.message || error)}`);
    process.exit(1);
  });
