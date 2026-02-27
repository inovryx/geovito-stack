'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');
const API_BASE = String(process.env.API_BASE || 'http://127.0.0.1:1337').replace(/\/$/, '');

const ROLE_UID = 'plugin::users-permissions.role';
const PROFILE_UID = 'api::creator-profile.creator-profile';
const BLOG_POST_UID = 'api::blog-post.blog-post';
const BLOG_COMMENT_UID = 'api::blog-comment.blog-comment';
const BLOG_COMMENT_HELPFUL_UID = 'api::blog-comment-helpful.blog-comment-helpful';
const CONTENT_REPORT_UID = 'api::content-report.content-report';

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
const TEMP_PASSWORD = 'TempPassw0rd!';

const created = {
  userIds: [],
  roleId: null,
  profileId: null,
  postIds: [],
  commentRefs: [],
  reportRefs: [],
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

const findCommentEntity = async (strapi, commentId) => {
  const rows = await strapi.entityService.findMany(BLOG_COMMENT_UID, {
    publicationState: 'preview',
    filters: {
      comment_id: String(commentId || ''),
    },
    fields: ['id', 'comment_id', 'status', 'thread_depth', 'report_count', 'helpful_count'],
    populate: {
      parent_comment: {
        fields: ['comment_id'],
      },
    },
    limit: 1,
  });
  return rows[0] || null;
};

const findReportEntity = async (strapi, reportId) => {
  const rows = await strapi.entityService.findMany(CONTENT_REPORT_UID, {
    publicationState: 'preview',
    filters: {
      report_id: String(reportId || ''),
    },
    fields: ['id', 'report_id', 'status'],
    limit: 1,
  });
  return rows[0] || null;
};

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

    const reservedUsernameAttempt = await requestJson({
      method: 'PUT',
      urlPath: '/api/creator-profile/me',
      token: outsiderIdentity.token,
      body: {
        username: 'admin',
        display_name: 'Reserved Username Attempt',
      },
    });
    if (reservedUsernameAttempt.status === 400) {
      pass('reserved creator username is blocked');
    } else {
      fail(`reserved username expected 400, got ${reservedUsernameAttempt.status}`);
    }

    const immutableUsernameAttempt = await requestJson({
      method: 'PUT',
      urlPath: '/api/creator-profile/me',
      token: memberIdentity.token,
      body: {
        username: `${creatorUsername}-mutated`,
      },
    });
    if (immutableUsernameAttempt.status === 400) {
      pass('creator username cannot be changed after initial profile create');
    } else {
      fail(`immutable username expected 400, got ${immutableUsernameAttempt.status}`);
    }

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

    const beforeRows = Array.isArray(postsBeforeModeration.json?.data?.posts) ? postsBeforeModeration.json.data.posts : [];
    const beforeIds = new Set(beforeRows.map((row) => String(row?.post_id || '')));
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
    const submittedBefore = beforeRows.find((row) => String(row?.post_id || '') === submittedPostId) || null;
    if (submittedBefore?.in_review === true) {
      pass('submitted-visible user post carries in_review=true');
    } else {
      fail('submitted-visible user post should carry in_review=true');
    }
    const approvedBefore = beforeRows.find((row) => String(row?.post_id || '') === approvedPostId) || null;
    if (approvedBefore && approvedBefore?.in_review !== true) {
      pass('approved user post does not carry in_review marker');
    } else {
      fail('approved user post should not carry in_review=true');
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

    const memberCommentSubmit = await requestJson({
      method: 'POST',
      urlPath: '/api/blog-comments/submit',
      token: memberIdentity.token,
      body: {
        post_id: approvedPostId,
        body: 'UGC contract root comment',
        language: 'en',
      },
    });
    if (memberCommentSubmit.status === 201) {
      pass('member can submit root comment');
    } else {
      fail(`member root comment submit expected 201, got ${memberCommentSubmit.status}`);
    }
    const rootCommentRef = String(memberCommentSubmit.json?.comment_ref || '').trim();
    if (rootCommentRef) {
      created.commentRefs.push(rootCommentRef);
      pass('root comment reference returned');
    } else {
      fail('root comment reference is missing');
    }

    let rootComment = rootCommentRef ? await findCommentEntity(strapi, rootCommentRef) : null;
    if (rootComment?.id) {
      pass('root comment entity resolved');
    } else {
      fail('root comment entity not found');
    }

    if (rootComment?.status !== 'approved' && rootCommentRef) {
      const approveRoot = await requestJson({
        method: 'POST',
        urlPath: '/api/blog-comments/moderation/set',
        token: editorIdentity.token,
        body: {
          comment_id: rootCommentRef,
          status: 'approved',
          moderation_notes: 'approved by ugc contract check',
        },
      });
      if (approveRoot.status === 200) {
        pass('editor can approve submitted root comment');
      } else {
        fail(`editor root comment moderation expected 200, got ${approveRoot.status}`);
      }
      rootComment = await findCommentEntity(strapi, rootCommentRef);
    }

    if (String(rootComment?.status || '') === 'approved') {
      pass('root comment is approved for helpful tests');
    } else {
      fail('root comment must be approved before helpful toggle tests');
    }

    const replySubmit = await requestJson({
      method: 'POST',
      urlPath: '/api/blog-comments/submit',
      token: outsiderIdentity.token,
      body: {
        post_id: approvedPostId,
        parent_comment_id: rootCommentRef,
        body: 'UGC contract first-level reply',
        language: 'en',
      },
    });
    if (replySubmit.status === 201) {
      pass('member can submit first-level reply');
    } else {
      fail(`reply submit expected 201, got ${replySubmit.status}`);
    }
    const replyCommentRef = String(replySubmit.json?.comment_ref || '').trim();
    if (replyCommentRef) {
      created.commentRefs.push(replyCommentRef);
      pass('reply comment reference returned');
    } else {
      fail('reply comment reference is missing');
    }

    const replyComment = replyCommentRef ? await findCommentEntity(strapi, replyCommentRef) : null;
    if (Number(replyComment?.thread_depth || 0) === 1) {
      pass('reply comment thread depth is 1');
    } else {
      fail('reply comment thread depth should be 1');
    }
    if (String(replyComment?.parent_comment?.comment_id || '') === rootCommentRef) {
      pass('reply parent linkage is correct');
    } else {
      fail('reply parent linkage is invalid');
    }

    const nestedReplyAttempt = await requestJson({
      method: 'POST',
      urlPath: '/api/blog-comments/submit',
      token: memberIdentity.token,
      body: {
        post_id: approvedPostId,
        parent_comment_id: replyCommentRef,
        body: 'UGC contract nested reply should fail',
        language: 'en',
      },
    });
    if (nestedReplyAttempt.status === 400) {
      pass('nested reply depth > 1 is blocked');
    } else {
      fail(`nested reply expected 400, got ${nestedReplyAttempt.status}`);
    }

    const helpfulAnonymous = await requestJson({
      method: 'POST',
      urlPath: '/api/blog-comments/helpful/toggle',
      body: {
        comment_id: rootCommentRef,
      },
    });
    if (helpfulAnonymous.status === 401) {
      pass('anonymous helpful toggle is blocked');
    } else {
      fail(`anonymous helpful toggle expected 401, got ${helpfulAnonymous.status}`);
    }

    const helpfulOn = await requestJson({
      method: 'POST',
      urlPath: '/api/blog-comments/helpful/toggle',
      token: memberIdentity.token,
      body: {
        comment_id: rootCommentRef,
      },
    });
    if (helpfulOn.status === 200 && helpfulOn.json?.helpful === true) {
      pass('member helpful toggle ON works');
    } else {
      fail(`member helpful ON expected 200 + helpful=true, got ${helpfulOn.status}`);
    }

    const helpfulOff = await requestJson({
      method: 'POST',
      urlPath: '/api/blog-comments/helpful/toggle',
      token: memberIdentity.token,
      body: {
        comment_id: rootCommentRef,
      },
    });
    if (helpfulOff.status === 200 && helpfulOff.json?.helpful === false) {
      pass('member helpful toggle OFF works');
    } else {
      fail(`member helpful OFF expected 200 + helpful=false, got ${helpfulOff.status}`);
    }

    const commentAfterHelpful = await findCommentEntity(strapi, rootCommentRef);
    if (Number(commentAfterHelpful?.helpful_count || 0) === 0) {
      pass('helpful_count resets after toggle off');
    } else {
      fail('helpful_count should be 0 after toggle off');
    }

    const reportSubmit = await requestJson({
      method: 'POST',
      urlPath: '/api/content-reports/submit',
      body: {
        target_type: 'comment',
        target_ref: rootCommentRef,
        reason: 'spam',
        note: 'ugc contract report check',
      },
    });
    if (reportSubmit.status === 201) {
      pass('content report submit works for comment target');
    } else {
      fail(`content report submit expected 201, got ${reportSubmit.status}`);
    }
    const reportRef = String(reportSubmit.json?.data?.report_id || '').trim();
    if (reportRef) {
      created.reportRefs.push(reportRef);
      pass('report reference returned');
    } else {
      fail('report reference is missing');
    }

    const commentAfterReport = await findCommentEntity(strapi, rootCommentRef);
    if (Number(commentAfterReport?.report_count || 0) >= 1) {
      pass('comment report_count is incremented after report submit');
    } else {
      fail('comment report_count should increment after report submit');
    }

    const memberReportList = await requestJson({
      method: 'GET',
      urlPath: '/api/content-reports/moderation/list',
      token: memberIdentity.token,
    });
    if (memberReportList.status === 403) {
      pass('member cannot access report moderation list');
    } else {
      fail(`member report moderation list expected 403, got ${memberReportList.status}`);
    }

    const editorReportList = await requestJson({
      method: 'GET',
      urlPath: '/api/content-reports/moderation/list?status=new&limit=50',
      token: editorIdentity.token,
    });
    if (editorReportList.status === 200) {
      pass('editor can access report moderation list');
    } else {
      fail(`editor report moderation list expected 200, got ${editorReportList.status}`);
    }
    const listedReportIds = new Set(
      (Array.isArray(editorReportList.json?.data) ? editorReportList.json.data : []).map((row) => String(row?.report_id || ''))
    );
    if (reportRef && listedReportIds.has(reportRef)) {
      pass('submitted report appears in moderation list');
    } else {
      fail('submitted report is missing in moderation list');
    }

    const editorReportSet = await requestJson({
      method: 'POST',
      urlPath: '/api/content-reports/moderation/set',
      token: editorIdentity.token,
      body: {
        report_id: reportRef,
        next_status: 'reviewing',
        resolution_note: 'checking',
      },
    });
    if (editorReportSet.status === 200 && String(editorReportSet.json?.data?.status || '') === 'reviewing') {
      pass('editor can move report status to reviewing');
    } else {
      fail(`editor report moderation set expected 200 + reviewing, got ${editorReportSet.status}`);
    }

    const reportEntity = reportRef ? await findReportEntity(strapi, reportRef) : null;
    if (String(reportEntity?.status || '') === 'reviewing') {
      pass('report entity state is updated to reviewing');
    } else {
      fail('report entity state should be reviewing');
    }

    const memberSettingsRead = await requestJson({
      method: 'GET',
      urlPath: '/api/community-settings/effective',
      token: memberIdentity.token,
    });
    if (memberSettingsRead.status === 403) {
      pass('member cannot read effective community settings');
    } else {
      fail(`member effective settings expected 403, got ${memberSettingsRead.status}`);
    }

    const editorSettingsRead = await requestJson({
      method: 'GET',
      urlPath: '/api/community-settings/effective',
      token: editorIdentity.token,
    });
    if (editorSettingsRead.status === 200 && typeof editorSettingsRead.json?.data?.ugc_enabled === 'boolean') {
      pass('editor can read effective community settings');
    } else {
      fail(`editor effective settings expected 200 + data.ugc_enabled, got ${editorSettingsRead.status}`);
    }

    await strapi.entityService.update(PROFILE_UID, Number(profile.id), {
      data: {
        visibility: 'members',
      },
    });

    const membersAnonProfile = await requestJson({
      method: 'GET',
      urlPath: `/api/creators/${encodeURIComponent(creatorUsername)}`,
    });
    if (membersAnonProfile.status === 404) {
      pass('members-only profile is hidden from anonymous access');
    } else {
      fail(`members-only profile anon expected 404, got ${membersAnonProfile.status}`);
    }

    const membersAuthProfile = await requestJson({
      method: 'GET',
      urlPath: `/api/creators/${encodeURIComponent(creatorUsername)}`,
      token: outsiderIdentity.token,
    });
    if (membersAuthProfile.status === 200) {
      pass('members-only profile is visible to authenticated member');
    } else {
      fail(`members-only profile auth expected 200, got ${membersAuthProfile.status}`);
    }

    await strapi.entityService.update(PROFILE_UID, Number(profile.id), {
      data: {
        visibility: 'private',
      },
    });

    const privateOutsiderProfile = await requestJson({
      method: 'GET',
      urlPath: `/api/creators/${encodeURIComponent(creatorUsername)}`,
      token: outsiderIdentity.token,
    });
    if (privateOutsiderProfile.status === 404) {
      pass('private profile is hidden from non-owner member');
    } else {
      fail(`private profile outsider expected 404, got ${privateOutsiderProfile.status}`);
    }

    const privateOwnerProfile = await requestJson({
      method: 'GET',
      urlPath: `/api/creators/${encodeURIComponent(creatorUsername)}`,
      token: memberIdentity.token,
    });
    if (privateOwnerProfile.status === 200) {
      pass('private profile remains visible to owner');
    } else {
      fail(`private profile owner expected 200, got ${privateOwnerProfile.status}`);
    }

    const privateEditorProfile = await requestJson({
      method: 'GET',
      urlPath: `/api/creators/${encodeURIComponent(creatorUsername)}`,
      token: editorIdentity.token,
    });
    if (privateEditorProfile.status === 404) {
      pass('private profile is hidden from editor role');
    } else {
      fail(`private profile editor expected 404, got ${privateEditorProfile.status}`);
    }

    const privateOutsiderPosts = await requestJson({
      method: 'GET',
      urlPath: `/api/creators/${encodeURIComponent(creatorUsername)}/posts?lang=en&limit=60`,
      token: outsiderIdentity.token,
    });
    if (privateOutsiderPosts.status === 404) {
      pass('private profile posts are hidden from non-owner member');
    } else {
      fail(`private profile posts outsider expected 404, got ${privateOutsiderPosts.status}`);
    }

    const privateOwnerPosts = await requestJson({
      method: 'GET',
      urlPath: `/api/creators/${encodeURIComponent(creatorUsername)}/posts?lang=en&limit=60`,
      token: memberIdentity.token,
    });
    if (privateOwnerPosts.status === 200) {
      pass('private profile posts remain visible to owner');
    } else {
      fail(`private profile posts owner expected 200, got ${privateOwnerPosts.status}`);
    }
  } catch (error) {
    const message = String(error?.message || error || '');
    if (!['api_not_ready', 'ugc_profile_public_disabled', 'authenticated_role_missing'].includes(message)) {
      fail(`unexpected runtime error: ${message}`);
    }
  } finally {
    if (strapi) {
      const userService = strapi.plugin('users-permissions').service('user');
      for (const reportRef of created.reportRefs) {
        try {
          const report = await findReportEntity(strapi, reportRef);
          if (report?.id) {
            await strapi.entityService.delete(CONTENT_REPORT_UID, Number(report.id));
          }
        } catch (_error) {
          // best-effort cleanup
        }
      }
      for (const commentRef of created.commentRefs) {
        try {
          const helpfulRows = await strapi.entityService.findMany(BLOG_COMMENT_HELPFUL_UID, {
            filters: { blog_comment_ref: commentRef },
            fields: ['id'],
            limit: 5000,
          });
          for (const row of helpfulRows) {
            if (row?.id) {
              await strapi.entityService.delete(BLOG_COMMENT_HELPFUL_UID, Number(row.id));
            }
          }
        } catch (_error) {
          // best-effort cleanup
        }
        try {
          const comment = await findCommentEntity(strapi, commentRef);
          if (comment?.id) {
            await strapi.entityService.delete(BLOG_COMMENT_UID, Number(comment.id));
          }
        } catch (_error) {
          // best-effort cleanup
        }
      }
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
