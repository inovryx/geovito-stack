'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');
const API_BASE = String(process.env.API_BASE || 'http://127.0.0.1:1337').replace(/\/$/, '');

const ROLE_UID = 'plugin::users-permissions.role';
const PROFILE_UID = 'api::creator-profile.creator-profile';
const BLOG_POST_UID = 'api::blog-post.blog-post';

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
const TEMP_PASSWORD = 'TempPassw0rd!';

const created = {
  userIds: [],
  roleId: null,
  profileId: null,
  postIds: [],
};

let failCount = 0;
let passCount = 0;
let skipCount = 0;

const pass = (message) => {
  passCount += 1;
  console.log(`PASS: ${message}`);
};

const fail = (message) => {
  failCount += 1;
  console.log(`FAIL: ${message}`);
};

const skip = (message) => {
  skipCount += 1;
  console.log(`SKIP: ${message}`);
};

const isTrue = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForApi = async (attempts = 45) => {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(`${API_BASE}/admin`, {
        method: 'GET',
      });
      if (response.ok) return true;
    } catch (_error) {
      // retry
    }
    await sleep(1000);
  }
  return false;
};

const requestJson = async ({ method = 'GET', urlPath, token = '', body = undefined }) => {
  const headers = {
    Accept: 'application/json',
  };
  const options = {
    method,
    headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${urlPath}`, options);
  const raw = await response.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch (_error) {
    json = null;
  }

  return {
    status: response.status,
    json,
    raw,
  };
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

const createUserAndToken = async ({ strapi, roleId, username, email }) => {
  const userService = strapi.plugin('users-permissions').service('user');
  const jwtService = strapi.plugin('users-permissions').service('jwt');

  const user = await userService.add({
    username,
    email,
    password: TEMP_PASSWORD,
    confirmed: true,
    blocked: false,
    provider: 'local',
    role: roleId,
  });
  created.userIds.push(Number(user.id));

  const token = await Promise.resolve(jwtService.issue({ id: Number(user.id) }));
  return { user, token };
};

const createUserPost = async ({ strapi, ownerUserId, ownerUsername, postId, title, slug, state }) => {
  const isApproved = state === 'approved';
  const nowIso = new Date().toISOString();

  const entry = await strapi.entityService.create(BLOG_POST_UID, {
    data: {
      post_id: postId,
      canonical_language: 'en',
      original_language: 'en',
      translations: [
        {
          language: 'en',
          status: isApproved ? 'complete' : 'draft',
          title,
          slug,
          excerpt: `${title} excerpt`,
          body: `<p>${title} body</p>`,
          runtime_translation: false,
          indexable: isApproved,
          canonical_path: `/en/blog/${slug}/`,
        },
      ],
      tags: ['ugc-contract'],
      related_place_refs: [],
      content_source: 'user',
      owner_user: Number(ownerUserId),
      owner_user_id: Number(ownerUserId),
      owner_username_snapshot: ownerUsername,
      submission_state: state,
      site_visibility: 'visible',
      moderation_notes: null,
      reviewed_at: null,
      reviewed_by: null,
      review_flags: null,
      revision_enabled: true,
      mock: false,
      publishedAt: isApproved ? nowIso : null,
      published_on: isApproved ? nowIso.slice(0, 10) : null,
    },
  });

  created.postIds.push(Number(entry.id));
  return entry;
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const run = async () => {
  let strapi;
  try {
    console.log('==============================================================');
    console.log('GEOVITO UGC API CONTRACT CHECK');
    console.log(`API_BASE=${API_BASE}`);
    console.log('==============================================================');

    if (!(await waitForApi())) {
      fail(`strapi readiness check failed (${API_BASE}/admin)`);
      throw new Error('api_not_ready');
    }
    pass('strapi readiness check');

    if (!isTrue(process.env.UGC_PROFILE_PUBLIC_ENABLED, true)) {
      fail('UGC_PROFILE_PUBLIC_ENABLED=false (public creator endpoints disabled)');
      throw new Error('ugc_profile_public_disabled');
    }
    pass('UGC_PROFILE_PUBLIC_ENABLED=true');

    strapi = await createStrapiApp();

    const roleQuery = strapi.db.query(ROLE_UID);
    const authRole = await roleQuery.findOne({ where: { type: 'authenticated' } });
    if (!authRole?.id) {
      fail('users-permissions authenticated role not found');
      throw new Error('authenticated_role_missing');
    }
    pass('authenticated role resolved');

    const editorRole = await roleQuery.create({
      data: {
        name: `UGC Editor ${SUFFIX}`,
        description: 'temporary role for ugc contract check',
        type: `ugc-editor-${SUFFIX}`,
      },
    });
    created.roleId = Number(editorRole.id);
    pass('temporary editor role created');

    const memberIdentity = await createUserAndToken({
      strapi,
      roleId: Number(authRole.id),
      username: `ugc-member-${SUFFIX}`,
      email: `ugc-member-${SUFFIX}@example.test`,
    });
    const outsiderIdentity = await createUserAndToken({
      strapi,
      roleId: Number(authRole.id),
      username: `ugc-other-${SUFFIX}`,
      email: `ugc-other-${SUFFIX}@example.test`,
    });
    const editorIdentity = await createUserAndToken({
      strapi,
      roleId: Number(editorRole.id),
      username: `ugc-editor-${SUFFIX}`,
      email: `ugc-editor-${SUFFIX}@example.test`,
    });
    pass('member/outsider/editor users created');

    const creatorUsername = `ugc-${SUFFIX}`;
    const profile = await strapi.entityService.create(PROFILE_UID, {
      data: {
        owner_user: Number(memberIdentity.user.id),
        owner_user_id: Number(memberIdentity.user.id),
        username: creatorUsername,
        display_name: 'UGC Contract Member',
        bio: 'temporary profile for contract verification',
        accent_color: 'ocean',
        visibility: 'public',
        citizen_card_enabled: true,
      },
    });
    created.profileId = Number(profile.id);
    pass('creator profile created');

    const draftPostId = `ugc-draft-${SUFFIX}`;
    const submittedPostId = `ugc-submitted-${SUFFIX}`;
    const approvedPostId = `ugc-approved-${SUFFIX}`;

    await createUserPost({
      strapi,
      ownerUserId: Number(memberIdentity.user.id),
      ownerUsername: creatorUsername,
      postId: draftPostId,
      title: 'UGC Draft Contract Post',
      slug: `ugc-draft-${SUFFIX}`,
      state: 'draft',
    });
    await createUserPost({
      strapi,
      ownerUserId: Number(memberIdentity.user.id),
      ownerUsername: creatorUsername,
      postId: submittedPostId,
      title: 'UGC Submitted Contract Post',
      slug: `ugc-submitted-${SUFFIX}`,
      state: 'submitted',
    });
    await createUserPost({
      strapi,
      ownerUserId: Number(memberIdentity.user.id),
      ownerUsername: creatorUsername,
      postId: approvedPostId,
      title: 'UGC Approved Contract Post',
      slug: `ugc-approved-${SUFFIX}`,
      state: 'approved',
    });
    pass('draft/submitted/approved user posts seeded');

    const profileResponse = await requestJson({
      method: 'GET',
      urlPath: `/api/creators/${encodeURIComponent(creatorUsername)}`,
    });
    if (profileResponse.status === 200) {
      pass('GET /api/creators/:username returns 200');
    } else {
      fail(`GET /api/creators/:username expected 200, got ${profileResponse.status}`);
    }

    const publicProfile = profileResponse.json?.data || null;
    if (publicProfile?.username === creatorUsername) {
      pass('public creator payload returns expected username');
    } else {
      fail('public creator payload missing/invalid username');
    }
    if (!hasOwn(publicProfile, 'owner_user_id')) {
      pass('public creator payload does not expose owner_user_id');
    } else {
      fail('public creator payload must not expose owner_user_id');
    }

    const postsBeforeModeration = await requestJson({
      method: 'GET',
      urlPath: `/api/creators/${encodeURIComponent(creatorUsername)}/posts?lang=en&limit=60`,
    });
    if (postsBeforeModeration.status === 200) {
      pass('GET /api/creators/:username/posts returns 200');
    } else {
      fail(`GET /api/creators/:username/posts expected 200, got ${postsBeforeModeration.status}`);
    }

    const beforeIds = new Set(
      (Array.isArray(postsBeforeModeration.json?.data?.posts) ? postsBeforeModeration.json.data.posts : []).map((row) =>
        String(row?.post_id || '')
      )
    );
    if (beforeIds.has(approvedPostId)) {
      pass('approved user post is visible in public creator list');
    } else {
      fail('approved user post should be visible in public creator list');
    }
    if (beforeIds.has(submittedPostId)) {
      pass('submitted-visible user post is visible in public creator list (in-review)');
    } else {
      fail('submitted-visible user post should be visible in public creator list');
    }
    if (!beforeIds.has(draftPostId)) {
      pass('draft user post remains hidden from public creator list');
    } else {
      fail('draft user post leaked into public creator list');
    }

    const memberModeration = await requestJson({
      method: 'POST',
      urlPath: '/api/blog-posts/moderation/set',
      token: memberIdentity.token,
      body: {
        post_id: submittedPostId,
        next_state: 'approved',
        moderation_notes: 'member should not be able to moderate',
      },
    });
    if (memberModeration.status === 403) {
      pass('member cannot call moderation set endpoint');
    } else {
      fail(`member moderation expected 403, got ${memberModeration.status}`);
    }

    const editorModeration = await requestJson({
      method: 'POST',
      urlPath: '/api/blog-posts/moderation/set',
      token: editorIdentity.token,
      body: {
        post_id: submittedPostId,
        next_state: 'approved',
        moderation_notes: 'approved by ugc contract check',
      },
    });
    if (editorModeration.status === 200) {
      pass('editor can approve submitted user post');
    } else {
      fail(`editor moderation expected 200, got ${editorModeration.status}`);
    }

    const writeEnabled = isTrue(process.env.UGC_POST_WRITE_ENABLED, false);
    const outsiderDraftUpdate = await requestJson({
      method: 'PUT',
      urlPath: `/api/blog-posts/me/draft/${encodeURIComponent(draftPostId)}`,
      token: outsiderIdentity.token,
      body: {
        title: 'Outsider edit attempt',
        slug: `outsider-${SUFFIX}`,
        body: 'should fail',
      },
    });

    if (writeEnabled) {
      if (outsiderDraftUpdate.status === 403) {
        pass('non-owner cannot update another user draft (403)');
      } else {
        fail(`non-owner draft update expected 403, got ${outsiderDraftUpdate.status}`);
      }
    } else if (outsiderDraftUpdate.status === 403) {
      pass('draft update remains forbidden while UGC_POST_WRITE_ENABLED=false');
      skip('ownership-specific draft update check skipped because write flag is disabled');
    } else {
      fail(`draft update expected 403 while write disabled, got ${outsiderDraftUpdate.status}`);
    }

    const postsAfterModeration = await requestJson({
      method: 'GET',
      urlPath: `/api/creators/${encodeURIComponent(creatorUsername)}/posts?lang=en&limit=60`,
    });
    const afterIds = new Set(
      (Array.isArray(postsAfterModeration.json?.data?.posts) ? postsAfterModeration.json.data.posts : []).map((row) =>
        String(row?.post_id || '')
      )
    );
    if (afterIds.has(submittedPostId)) {
      pass('approved-by-editor post remains visible in public creator list');
    } else {
      fail('editor-approved post should become visible in public creator list');
    }

    const moderatedRows = Array.isArray(postsAfterModeration.json?.data?.posts) ? postsAfterModeration.json.data.posts : [];
    const moderatedSubmitted = moderatedRows.find((row) => String(row?.post_id || '') === submittedPostId) || null;
    if (String(moderatedSubmitted?.submission_state || '') === 'approved') {
      pass('moderated post state is approved in public creator payload');
    } else {
      fail('moderated post state should be approved in public creator payload');
    }
  } catch (error) {
    const message = String(error?.message || error || '');
    if (!['api_not_ready', 'ugc_profile_public_disabled', 'authenticated_role_missing'].includes(message)) {
      fail(`unexpected runtime error: ${message}`);
    }
  } finally {
    if (strapi) {
      const userService = strapi.plugin('users-permissions').service('user');
      for (const postId of created.postIds) {
        try {
          await strapi.entityService.delete(BLOG_POST_UID, Number(postId));
        } catch (_error) {
          // best-effort cleanup
        }
      }
      if (created.profileId) {
        try {
          await strapi.entityService.delete(PROFILE_UID, Number(created.profileId));
        } catch (_error) {
          // best-effort cleanup
        }
      }
      for (const userId of created.userIds) {
        try {
          await userService.remove({ id: Number(userId) });
        } catch (_error) {
          // best-effort cleanup
        }
      }
      if (created.roleId) {
        try {
          await strapi.db.query(ROLE_UID).delete({ where: { id: Number(created.roleId) } });
        } catch (_error) {
          // best-effort cleanup
        }
      }
      await strapi.destroy();
    }

    console.log('==============================================================');
    if (failCount > 0) {
      console.log(`UGC API CONTRACT CHECK: FAIL (${failCount} issue, ${skipCount} skip, ${passCount} pass)`);
      console.log('==============================================================');
      process.exit(1);
    }
    console.log(`UGC API CONTRACT CHECK: PASS (${skipCount} skip, ${passCount} pass)`);
    console.log('==============================================================');
    process.exit(0);
  }
};

run();
