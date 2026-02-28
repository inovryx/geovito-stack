'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');
const API_BASE = String(process.env.API_BASE || 'http://127.0.0.1:1337').replace(/\/$/, '');

const ROLE_UID = 'plugin::users-permissions.role';
const USER_UID = 'plugin::users-permissions.user';
const FOLLOW_UID = 'api::user-follow.user-follow';
const COMMUNITY_UID = 'api::community-setting.community-setting';

const TEMP_PASSWORD = 'TempPassw0rd!';
const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);

const created = {
  userIds: [],
  followIds: [],
};

const communitySnapshot = {
  hasRow: false,
  rowId: null,
  followSystemEnabled: false,
};

let passCount = 0;
let failCount = 0;

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
  for (let index = 0; index < attempts; index += 1) {
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
  const headers = {
    Accept: 'application/json',
  };
  const options = { method, headers };

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

const rememberCommunitySnapshot = async (strapi) => {
  const row = await strapi.db.query(COMMUNITY_UID).findOne({ where: {} });
  if (!row?.id) return;
  communitySnapshot.hasRow = true;
  communitySnapshot.rowId = Number(row.id);
  communitySnapshot.followSystemEnabled = row.follow_system_enabled === true;
};

const setFollowSystemEnabled = async (strapi, enabled) => {
  const row = await strapi.db.query(COMMUNITY_UID).findOne({ where: {} });
  if (row?.id) {
    await strapi.entityService.update(COMMUNITY_UID, Number(row.id), {
      data: {
        follow_system_enabled: enabled === true,
      },
    });
    return;
  }

  const createdRow = await strapi.entityService.create(COMMUNITY_UID, {
    data: {
      follow_system_enabled: enabled === true,
    },
  });
  communitySnapshot.hasRow = false;
  communitySnapshot.rowId = Number(createdRow.id);
};

const restoreCommunitySnapshot = async (strapi) => {
  if (communitySnapshot.hasRow && communitySnapshot.rowId) {
    await strapi.entityService.update(COMMUNITY_UID, Number(communitySnapshot.rowId), {
      data: {
        follow_system_enabled: communitySnapshot.followSystemEnabled === true,
      },
    });
    return;
  }

  if (!communitySnapshot.hasRow && communitySnapshot.rowId) {
    await strapi.entityService.delete(COMMUNITY_UID, Number(communitySnapshot.rowId));
  }
};

const cleanup = async (strapi) => {
  for (const followId of created.followIds) {
    try {
      const rows = await strapi.entityService.findMany(FOLLOW_UID, {
        publicationState: 'preview',
        filters: { follow_id: String(followId || '') },
        fields: ['id'],
        limit: 1,
      });
      const row = rows[0] || null;
      if (row?.id) {
        await strapi.entityService.delete(FOLLOW_UID, Number(row.id));
      }
    } catch (_error) {
      // best effort cleanup
    }
  }

  for (const userId of created.userIds) {
    try {
      await strapi.entityService.delete(USER_UID, Number(userId));
    } catch (_error) {
      // best effort cleanup
    }
  }

  try {
    await restoreCommunitySnapshot(strapi);
  } catch (_error) {
    // best effort cleanup
  }
};

const run = async () => {
  let strapi;
  try {
    console.log('==============================================================');
    console.log('GEOVITO FOLLOW SYSTEM SMOKE');
    console.log(`API_BASE=${API_BASE}`);
    console.log('==============================================================');

    if (!(await waitForApi())) {
      fail(`strapi readiness check failed (${API_BASE}/admin)`);
      throw new Error('api_not_ready');
    }
    pass('strapi readiness check');

    strapi = await createStrapiApp();
    await rememberCommunitySnapshot(strapi);

    const roleQuery = strapi.db.query(ROLE_UID);
    const authRole = await roleQuery.findOne({ where: { type: 'authenticated' } });
    if (!authRole?.id) {
      fail('authenticated role not found');
      throw new Error('authenticated_role_missing');
    }
    pass('authenticated role resolved');

    const memberIdentity = await createUserAndToken({
      strapi,
      roleId: Number(authRole.id),
      username: `follow-member-${SUFFIX}`,
      email: `follow-member-${SUFFIX}@example.test`,
    });
    pass('temporary member identity created');

    await setFollowSystemEnabled(strapi, false);
    pass('follow system forced disabled for guard check');

    const disabledToggle = await requestJson({
      method: 'POST',
      urlPath: '/api/user-follows/me/toggle',
      token: memberIdentity.token,
      body: {
        target_type: 'place',
        target_ref: `smoke-place-${SUFFIX}`,
      },
    });
    if (disabledToggle.status === 403) {
      pass('toggle is blocked when follow system is disabled');
    } else {
      fail(`disabled toggle expected 403, got ${disabledToggle.status}`);
    }

    await setFollowSystemEnabled(strapi, true);
    pass('follow system enabled for smoke checks');

    const followToggle = await requestJson({
      method: 'POST',
      urlPath: '/api/user-follows/me/toggle',
      token: memberIdentity.token,
      body: {
        target_type: 'place',
        target_ref: `smoke-place-${SUFFIX}`,
      },
    });
    const followId = String(followToggle.json?.data?.follow_id || '');
    if ((followToggle.status === 200 || followToggle.status === 201) && followToggle.json?.data?.following === true && followId) {
      created.followIds.push(followId);
      pass('member can follow place target');
    } else {
      fail(`follow toggle expected 200/201 + following=true, got ${followToggle.status}`);
    }

    const listResponse = await requestJson({
      method: 'GET',
      urlPath: '/api/user-follows/me/list?target_type=place&limit=20',
      token: memberIdentity.token,
    });
    const listItems = Array.isArray(listResponse.json?.data?.items) ? listResponse.json.data.items : [];
    if (listResponse.status === 200 && listItems.some((entry) => String(entry?.target_ref || '') === `smoke-place-${SUFFIX}`)) {
      pass('followed place appears in member list');
    } else {
      fail(`member follow list expected followed place, got status=${listResponse.status}`);
    }

    const selfFollow = await requestJson({
      method: 'POST',
      urlPath: '/api/user-follows/me/toggle',
      token: memberIdentity.token,
      body: {
        target_type: 'user',
        target_ref: String(memberIdentity.user.username || '').toLowerCase(),
      },
    });
    if (selfFollow.status === 400) {
      pass('self-follow is blocked');
    } else {
      fail(`self-follow expected 400, got ${selfFollow.status}`);
    }

    const unfollowToggle = await requestJson({
      method: 'POST',
      urlPath: '/api/user-follows/me/toggle',
      token: memberIdentity.token,
      body: {
        target_type: 'place',
        target_ref: `smoke-place-${SUFFIX}`,
      },
    });
    if ((unfollowToggle.status === 200 || unfollowToggle.status === 201) && unfollowToggle.json?.data?.following === false) {
      pass('toggle can unfollow existing target');
    } else {
      fail(`unfollow toggle expected following=false, got status=${unfollowToggle.status}`);
    }

    const listAfterUnfollow = await requestJson({
      method: 'GET',
      urlPath: '/api/user-follows/me/list?target_type=place&limit=20',
      token: memberIdentity.token,
    });
    const remaining = Array.isArray(listAfterUnfollow.json?.data?.items) ? listAfterUnfollow.json.data.items : [];
    if (listAfterUnfollow.status === 200 && !remaining.some((entry) => String(entry?.target_ref || '') === `smoke-place-${SUFFIX}`)) {
      pass('unfollow removes target from list');
    } else {
      fail(`unfollow list expected target removal, got status=${listAfterUnfollow.status}`);
    }
  } catch (error) {
    if (error?.message !== 'api_not_ready' && error?.message !== 'authenticated_role_missing') {
      console.error(error);
    }
  } finally {
    if (strapi) {
      await cleanup(strapi);
      await strapi.destroy();
    }

    console.log('==============================================================');
    if (failCount > 0) {
      console.log(`FOLLOW SYSTEM SMOKE: FAIL (${failCount} fail, ${passCount} pass)`);
      console.log('==============================================================');
      process.exitCode = 1;
    } else {
      console.log(`FOLLOW SYSTEM SMOKE: PASS (${passCount} pass)`);
      console.log('==============================================================');
      process.exitCode = 0;
    }
  }
};

run();
