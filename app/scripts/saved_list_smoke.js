'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');
const API_BASE = String(process.env.API_BASE || 'http://127.0.0.1:1337').replace(/\/$/, '');

const ROLE_UID = 'plugin::users-permissions.role';
const USER_UID = 'plugin::users-permissions.user';
const LIST_UID = 'api::user-saved-list.user-saved-list';
const ITEM_UID = 'api::user-saved-item.user-saved-item';

const TEMP_PASSWORD = 'TempPassw0rd!';
const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);

const created = {
  userId: null,
  listIds: [],
  itemIds: [],
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

  created.userId = Number(user.id);
  const token = await Promise.resolve(jwtService.issue({ id: Number(user.id) }));
  return { user, token };
};

const cleanup = async (strapi) => {
  for (const itemId of created.itemIds) {
    try {
      await strapi.entityService.delete(ITEM_UID, Number(itemId));
    } catch (_error) {
      // best effort
    }
  }

  for (const listId of created.listIds) {
    try {
      await strapi.entityService.delete(LIST_UID, Number(listId));
    } catch (_error) {
      // best effort
    }
  }

  if (created.userId) {
    try {
      await strapi.entityService.delete(USER_UID, Number(created.userId));
    } catch (_error) {
      // best effort
    }
  }
};

const run = async () => {
  let strapi;
  try {
    console.log('==============================================================');
    console.log('GEOVITO SAVED LIST SMOKE');
    console.log(`API_BASE=${API_BASE}`);
    console.log('==============================================================');

    if (!(await waitForApi())) {
      fail(`strapi readiness check failed (${API_BASE}/admin)`);
      throw new Error('api_not_ready');
    }
    pass('strapi readiness check');

    strapi = await createStrapiApp();

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
      username: `saved-list-member-${SUFFIX}`,
      email: `saved-list-member-${SUFFIX}@example.test`,
    });
    pass('temporary member identity created');

    const anonymousList = await requestJson({
      method: 'GET',
      urlPath: '/api/user-saved-lists/me/lists',
    });
    if (anonymousList.status === 401) {
      pass('anonymous access to /me/lists is blocked');
    } else {
      fail(`anonymous /me/lists expected 401, got ${anonymousList.status}`);
    }

    const createList = await requestJson({
      method: 'POST',
      urlPath: '/api/user-saved-lists/me/lists/upsert',
      token: memberIdentity.token,
      body: {
        data: {
          title: 'Gidileceklerim',
          slug: 'gidileceklerim',
          visibility: 'private',
          is_default: true,
        },
      },
    });

    const listId = String(createList.json?.data?.list_id || '');
    if (createList.status === 201 && listId) {
      pass('member can create saved list');
    } else {
      fail(`saved list create expected 201 with list_id, got ${createList.status}`);
    }

    const createdListRow = await strapi.entityService.findMany(LIST_UID, {
      publicationState: 'preview',
      filters: {
        owner_user_id: Number(memberIdentity.user.id),
        list_id: listId,
      },
      fields: ['id'],
      limit: 1,
    });
    if (createdListRow[0]?.id) {
      created.listIds.push(Number(createdListRow[0].id));
    }

    const listResponse = await requestJson({
      method: 'GET',
      urlPath: '/api/user-saved-lists/me/lists',
      token: memberIdentity.token,
    });
    const listItems = Array.isArray(listResponse.json?.data?.items) ? listResponse.json.data.items : [];
    if (listResponse.status === 200 && listItems.some((entry) => String(entry?.list_id || '') === listId)) {
      pass('member list endpoint returns created list');
    } else {
      fail(`member list endpoint expected list_id=${listId}, got status=${listResponse.status}`);
    }

    const savePlace = await requestJson({
      method: 'POST',
      urlPath: '/api/user-saved-lists/me/items/toggle',
      token: memberIdentity.token,
      body: {
        data: {
          list_id: listId,
          target_type: 'place',
          target_ref: 'italy-pilot',
          note: 'smoke save place',
        },
      },
    });

    const savedItemId = String(savePlace.json?.data?.item_id || '');
    if ((savePlace.status === 200 || savePlace.status === 201) && savePlace.json?.data?.saved === true && savedItemId) {
      pass('member can save place target into list');
    } else {
      fail(`save place expected 200/201 + saved=true, got ${savePlace.status}`);
    }

    const createdItemRow = await strapi.entityService.findMany(ITEM_UID, {
      publicationState: 'preview',
      filters: {
        owner_user_id: Number(memberIdentity.user.id),
        list_id: listId,
        item_id: savedItemId,
      },
      fields: ['id'],
      limit: 1,
    });
    if (createdItemRow[0]?.id) {
      created.itemIds.push(Number(createdItemRow[0].id));
    }

    const itemsResponse = await requestJson({
      method: 'GET',
      urlPath: `/api/user-saved-lists/me/items?list_id=${encodeURIComponent(listId)}`,
      token: memberIdentity.token,
    });
    const savedItems = Array.isArray(itemsResponse.json?.data?.items) ? itemsResponse.json.data.items : [];
    if (
      itemsResponse.status === 200 &&
      savedItems.some(
        (entry) =>
          String(entry?.list_id || '') === listId &&
          String(entry?.target_type || '') === 'place' &&
          String(entry?.target_ref || '') === 'italy-pilot'
      )
    ) {
      pass('member items endpoint returns saved place');
    } else {
      fail(`member items endpoint expected saved target, got status=${itemsResponse.status}`);
    }

    const unsavePlace = await requestJson({
      method: 'POST',
      urlPath: '/api/user-saved-lists/me/items/toggle',
      token: memberIdentity.token,
      body: {
        data: {
          list_id: listId,
          target_type: 'place',
          target_ref: 'italy-pilot',
          action: 'unsave',
        },
      },
    });
    if ((unsavePlace.status === 200 || unsavePlace.status === 201) && unsavePlace.json?.data?.saved === false) {
      pass('member can unsave existing target');
    } else {
      fail(`unsave expected saved=false, got ${unsavePlace.status}`);
    }

    const itemsAfterUnsave = await requestJson({
      method: 'GET',
      urlPath: `/api/user-saved-lists/me/items?list_id=${encodeURIComponent(listId)}`,
      token: memberIdentity.token,
    });
    const itemsAfter = Array.isArray(itemsAfterUnsave.json?.data?.items) ? itemsAfterUnsave.json.data.items : [];
    if (!itemsAfter.some((entry) => String(entry?.target_ref || '') === 'italy-pilot')) {
      pass('unsaved target is removed from list items');
    } else {
      fail('unsaved target still appears in list items');
    }

    const invalidTargetType = await requestJson({
      method: 'POST',
      urlPath: '/api/user-saved-lists/me/items/toggle',
      token: memberIdentity.token,
      body: {
        data: {
          list_id: listId,
          target_type: 'invalid',
          target_ref: 'italy-pilot',
        },
      },
    });
    if (invalidTargetType.status === 400) {
      pass('invalid target_type is rejected');
    } else {
      fail(`invalid target_type expected 400, got ${invalidTargetType.status}`);
    }
  } catch (error) {
    if (error?.message !== 'api_not_ready' && error?.message !== 'authenticated_role_missing') {
      console.error(error);
    }
  } finally {
    if (strapi) {
      try {
        await cleanup(strapi);
      } catch (_error) {
        // best effort cleanup
      }
      await strapi.destroy();
    }
  }

  console.log('==============================================================');
  if (failCount === 0) {
    console.log(`SAVED LIST SMOKE: PASS (${passCount} pass)`);
    console.log('==============================================================');
    process.exit(0);
  }

  console.log(`SAVED LIST SMOKE: FAIL (${failCount} fail, ${passCount} pass)`);
  console.log('==============================================================');
  process.exit(1);
};

void run();
