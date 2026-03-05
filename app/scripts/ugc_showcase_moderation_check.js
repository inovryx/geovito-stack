'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');
const BLOG_POST_UID = 'api::blog-post.blog-post';
const USER_UID = 'plugin::users-permissions.user';

const readEnv = (key, fallback = '') => {
  const value = String(process.env[key] || '').trim();
  return value || fallback;
};

const isTrue = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const cfg = {
  apiBase: readEnv('API_BASE', 'http://127.0.0.1:1337').replace(/\/+$/, ''),
  ownerEmail: readEnv('SHOWCASE_OWNER_EMAIL', 'ali.koc.00@gmail.com').toLowerCase(),
  creatorUsername: readEnv('SHOWCASE_CREATOR_USERNAME', 'olmysweet'),
  targetPostId: readEnv('TARGET_POST_ID', ''),
  restoreSubmitted: isTrue(process.env.RESTORE_TO_SUBMITTED, true),
};

if (!cfg.targetPostId) {
  cfg.targetPostId = `ugc-${cfg.creatorUsername}-first-place`;
}

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

const requestJson = async ({ method = 'GET', pathName, token, body }) => {
  const url = `${cfg.apiBase}${pathName.startsWith('/') ? pathName : `/${pathName}`}`;
  const headers = {
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: payload,
  });
  const raw = await response.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch (_) {
    json = null;
  }
  return {
    status: response.status,
    ok: response.ok,
    raw,
    json,
  };
};

const normalizeState = (value) => String(value || '').trim().toLowerCase();

const findPost = async (strapi, postId) => {
  const rows = await strapi.entityService.findMany(BLOG_POST_UID, {
    publicationState: 'preview',
    filters: { post_id: postId },
    fields: ['id', 'post_id', 'submission_state', 'site_visibility', 'published_on', 'publishedAt'],
    limit: 1,
  });
  return rows[0] || null;
};

const forceSubmitted = async (strapi, postId, reason = 'reset for moderation check') => {
  const post = await findPost(strapi, postId);
  if (!post?.id) {
    throw new Error(`target post not found: ${postId}`);
  }
  await strapi.entityService.update(BLOG_POST_UID, Number(post.id), {
    data: {
      submission_state: 'submitted',
      site_visibility: 'visible',
      publishedAt: null,
      published_on: null,
      reviewed_at: null,
      reviewed_by: null,
      moderation_notes: reason,
      review_flags: {
        in_review: true,
        source: 'ugc-showcase-moderation-check',
      },
    },
  });
};

const inSubmittedList = (payload, postId) => {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.some((row) => String(row?.post_id || '') === postId);
};

const inCreatorListApproved = (payload, postId) => {
  const rows = Array.isArray(payload?.data?.posts) ? payload.data.posts : [];
  const row = rows.find((entry) => String(entry?.post_id || '') === postId);
  if (!row) return false;
  return normalizeState(row.submission_state) === 'approved' && row.in_review !== true;
};

const inCreatorListSubmitted = (payload, postId) => {
  const rows = Array.isArray(payload?.data?.posts) ? payload.data.posts : [];
  const row = rows.find((entry) => String(entry?.post_id || '') === postId);
  if (!row) return false;
  return normalizeState(row.submission_state) === 'submitted' && row.in_review === true;
};

const run = async () => {
  let strapi;
  try {
    console.log('==============================================================');
    console.log('GEOVITO UGC SHOWCASE MODERATION CHECK');
    console.log(`api_base=${cfg.apiBase}`);
    console.log(`owner_email=${cfg.ownerEmail}`);
    console.log(`creator_username=${cfg.creatorUsername}`);
    console.log(`target_post_id=${cfg.targetPostId}`);
    console.log(`restore_to_submitted=${cfg.restoreSubmitted}`);
    console.log('==============================================================');

    strapi = await createStrapiApp();

    const ownerUser = await strapi.db.query(USER_UID).findOne({
      where: { email: cfg.ownerEmail },
      select: ['id', 'email', 'username'],
    });
    if (!ownerUser?.id) {
      throw new Error(`owner user not found (${cfg.ownerEmail})`);
    }
    console.log(`PASS: owner user resolved (id=${ownerUser.id} username=${ownerUser.username})`);

    const jwtService = strapi.plugin('users-permissions').service('jwt');
    const token = await Promise.resolve(jwtService.issue({ id: Number(ownerUser.id) }));
    if (!token) {
      throw new Error('failed to issue owner jwt');
    }
    console.log('PASS: owner jwt issued');

    const targetPost = await findPost(strapi, cfg.targetPostId);
    if (!targetPost?.id) {
      throw new Error(`target post not found (${cfg.targetPostId})`);
    }
    console.log(
      `INFO: target post current state=${normalizeState(targetPost.submission_state)} visibility=${normalizeState(targetPost.site_visibility)}`
    );

    if (normalizeState(targetPost.submission_state) !== 'submitted') {
      await forceSubmitted(strapi, cfg.targetPostId);
      console.log('PASS: target post forced to submitted for deterministic moderation test');
    }

    const listBefore = await requestJson({
      method: 'GET',
      pathName: '/api/blog-posts/moderation/list?state=submitted&limit=100',
      token,
    });
    if (listBefore.status !== 200) {
      throw new Error(`moderation list expected 200, got ${listBefore.status}`);
    }
    if (!inSubmittedList(listBefore.json, cfg.targetPostId)) {
      throw new Error(`target post missing in submitted moderation list (${cfg.targetPostId})`);
    }
    console.log('PASS: target post appears in moderation submitted list');

    const moderationSet = await requestJson({
      method: 'POST',
      pathName: '/api/blog-posts/moderation/set',
      token,
      body: {
        post_id: cfg.targetPostId,
        next_state: 'approved',
        moderation_notes: 'approved by ugc showcase moderation check',
      },
    });
    if (moderationSet.status !== 200) {
      throw new Error(`moderation set expected 200, got ${moderationSet.status}`);
    }
    console.log('PASS: moderation set endpoint approved target post');

    const creatorAfterApprove = await requestJson({
      method: 'GET',
      pathName: `/api/creators/${encodeURIComponent(cfg.creatorUsername)}/posts?lang=en&limit=80`,
    });
    if (creatorAfterApprove.status !== 200) {
      throw new Error(`creator posts expected 200 after approval, got ${creatorAfterApprove.status}`);
    }
    if (!inCreatorListApproved(creatorAfterApprove.json, cfg.targetPostId)) {
      throw new Error('creator posts payload does not show approved non-review state after moderation');
    }
    console.log('PASS: creator posts payload reflects approved + in_review=false');

    if (cfg.restoreSubmitted) {
      await forceSubmitted(strapi, cfg.targetPostId, 'restored to submitted by moderation check');
      const creatorAfterRestore = await requestJson({
        method: 'GET',
        pathName: `/api/creators/${encodeURIComponent(cfg.creatorUsername)}/posts?lang=en&limit=80`,
      });
      if (creatorAfterRestore.status !== 200) {
        throw new Error(`creator posts expected 200 after restore, got ${creatorAfterRestore.status}`);
      }
      if (!inCreatorListSubmitted(creatorAfterRestore.json, cfg.targetPostId)) {
        throw new Error('creator posts payload does not show submitted + in_review=true after restore');
      }
      console.log('PASS: target post restored to submitted + in_review=true');
    }

    console.log('==============================================================');
    console.log('UGC SHOWCASE MODERATION CHECK: PASS');
    console.log('==============================================================');
    return 0;
  } catch (error) {
    console.error(`FAIL: ${String(error?.message || error)}`);
    return 1;
  } finally {
    if (strapi) {
      try {
        await strapi.destroy();
      } catch (_) {
        // no-op
      }
    }
  }
};

void run()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`FAIL: ${String(error?.message || error)}`);
    process.exit(1);
  });
