'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');
const { getCommunitySettings, upsertCommunitySettings } = require('../src/modules/community-settings');

const APP_DIR = path.resolve(__dirname, '..');
const API_BASE = String(process.env.API_BASE || 'http://127.0.0.1:1337').replace(/\/$/, '');
const ROLE_UID = 'plugin::users-permissions.role';
const USER_UID = 'plugin::users-permissions.user';
const KILL_SWITCH_SMOKE_POST_REF = String(process.env.KILL_SWITCH_SMOKE_POST_REF || 'post-europe-city-breaks').trim();
const TEMP_PASSWORD = 'TempPassw0rd!';
const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);

let passCount = 0;
let failCount = 0;
const created = { userIds: [] };

const pass = (message) => {
  passCount += 1;
  console.log(`PASS: ${message}`);
};

const fail = (message) => {
  failCount += 1;
  console.log(`FAIL: ${message}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForApi = async (attempts = 45) => {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${API_BASE}/admin`, { method: 'GET' });
      if (response.ok) return true;
    } catch (_error) {
      // retry
    }
    await sleep(1000);
  }
  return false;
};

const requestJson = async ({ method = 'GET', urlPath, token = '', body = undefined }) => {
  const headers = { Accept: 'application/json' };
  const options = { method, headers };

  if (token) headers.Authorization = `Bearer ${token}`;
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
    raw,
    json,
  };
};

const cleanup = async (strapi) => {
  for (const userId of created.userIds) {
    try {
      await strapi.entityService.delete(USER_UID, Number(userId));
    } catch (_error) {
      // best effort
    }
  }
};

const run = async () => {
  if (!(await waitForApi())) {
    throw new Error(`strapi readiness check failed (${API_BASE}/admin)`);
  }

  const strapi = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });

  await strapi.load();
  let baseline = null;

  try {
    baseline = await getCommunitySettings(strapi, { refresh: true });
    pass('community baseline loaded');

    await upsertCommunitySettings(strapi, {
      ugc_enabled: false,
      guest_comments_enabled: false,
      post_links_enabled: false,
      comments_links_enabled: false,
      post_link_limit: 0,
      member_comment_link_limit: 0,
      guest_comment_link_limit: 0,
      moderation_strictness: 'strict',
    });
    pass('kill switch profile applied');

    const roleQuery = strapi.db.query(ROLE_UID);
    const authRole = await roleQuery.findOne({ where: { type: 'authenticated' } });
    if (!authRole?.id) throw new Error('authenticated role not found');

    const userService = strapi.plugin('users-permissions').service('user');
    const jwtService = strapi.plugin('users-permissions').service('jwt');

    const user = await userService.add({
      username: `kill-switch-member-${SUFFIX}`,
      email: `kill-switch-member-${SUFFIX}@example.test`,
      password: TEMP_PASSWORD,
      confirmed: true,
      blocked: false,
      provider: 'local',
      role: Number(authRole.id),
    });
    created.userIds.push(Number(user.id));

    const token = await Promise.resolve(jwtService.issue({ id: Number(user.id) }));
    pass('temporary member identity created');

    const draftResponse = await requestJson({
      method: 'POST',
      urlPath: '/api/blog-posts/me/draft',
      token,
      body: {
        title: 'Kill switch draft test',
        language: 'en',
        slug: `kill-switch-${SUFFIX}`,
        body: 'body',
      },
    });

    if (draftResponse.status === 403) {
      pass('UGC draft write blocked while kill switch active');
    } else {
      fail(`UGC draft write expected 403, got ${draftResponse.status}`);
    }

    const guestCommentResponse = await requestJson({
      method: 'POST',
      urlPath: '/api/blog-comments/submit',
      body: {
        blog_post_ref: KILL_SWITCH_SMOKE_POST_REF,
        body: 'kill switch guest comment check',
        language: 'en',
        guest_email: `guest-${SUFFIX}@example.test`,
        guest_name: 'Guest Smoke',
      },
    });

    if ([400, 401, 403, 429].includes(guestCommentResponse.status)) {
      pass(`guest comment blocked while kill switch active (status=${guestCommentResponse.status})`);
    } else {
      fail(`guest comment expected blocking 4xx, got ${guestCommentResponse.status}`);
    }
  } finally {
    if (baseline) {
      try {
        await upsertCommunitySettings(strapi, baseline);
        pass('community settings baseline restored');
      } catch (error) {
        fail(`failed to restore community settings baseline: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await cleanup(strapi);
    await strapi.destroy();
  }

  console.log('==============================================================');
  if (failCount > 0) {
    console.log(`KILL SWITCH SMOKE: FAIL (${failCount} fail, ${passCount} pass)`);
    console.log('==============================================================');
    process.exit(1);
  }

  console.log(`KILL SWITCH SMOKE: PASS (${passCount} pass)`);
  console.log('==============================================================');
};

run().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
