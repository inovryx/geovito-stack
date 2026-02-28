'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');
const API_BASE = String(process.env.API_BASE || 'http://127.0.0.1:1337').replace(/\/$/, '');

const ROLE_UID = 'plugin::users-permissions.role';
const USER_UID = 'plugin::users-permissions.user';
const TEMP_PASSWORD = 'TempPassw0rd!';
const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);

const EXPECTED_KEYS = [
  'ugc_enabled',
  'ugc_open_mode',
  'guest_comments_enabled',
  'post_links_enabled',
  'comments_links_enabled',
  'post_link_limit',
  'member_comment_link_limit',
  'guest_comment_link_limit',
  'default_profile_visibility',
  'moderation_strictness',
  'citizen_card_visible',
  'badges_visible',
  'follow_system_enabled',
  'notifications_defaults',
  'safety_notice_templates',
];

const created = {
  roleId: null,
  userIds: [],
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

const cleanup = async (strapi) => {
  for (const userId of created.userIds) {
    try {
      await strapi.entityService.delete(USER_UID, Number(userId));
    } catch (_error) {
      // best effort cleanup
    }
  }

  if (created.roleId) {
    try {
      await strapi.db.query(ROLE_UID).delete({
        where: { id: Number(created.roleId) },
      });
    } catch (_error) {
      // best effort cleanup
    }
  }
};

const isObjectLike = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const run = async () => {
  let strapi;
  try {
    console.log('==============================================================');
    console.log('GEOVITO COMMUNITY SETTINGS SMOKE');
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

    const editorRole = await roleQuery.create({
      data: {
        name: `Community Editor ${SUFFIX}`,
        description: 'temporary role for community settings smoke',
        type: `community-editor-${SUFFIX}`,
      },
    });
    created.roleId = Number(editorRole.id);
    pass('temporary editor role created');

    const memberIdentity = await createUserAndToken({
      strapi,
      roleId: Number(authRole.id),
      username: `community-member-${SUFFIX}`,
      email: `community-member-${SUFFIX}@example.test`,
    });
    pass('temporary member identity created');

    const editorIdentity = await createUserAndToken({
      strapi,
      roleId: Number(editorRole.id),
      username: `community-editor-${SUFFIX}`,
      email: `community-editor-${SUFFIX}@example.test`,
    });
    pass('temporary editor identity created');

    const noAuthResponse = await requestJson({
      method: 'GET',
      urlPath: '/api/community-settings/effective',
    });
    if (noAuthResponse.status === 403) {
      pass('anonymous user cannot read community settings effective');
    } else {
      fail(`anonymous effective expected 403, got ${noAuthResponse.status}`);
    }

    const memberResponse = await requestJson({
      method: 'GET',
      urlPath: '/api/community-settings/effective',
      token: memberIdentity.token,
    });
    if (memberResponse.status === 403) {
      pass('member cannot read community settings effective');
    } else {
      fail(`member effective expected 403, got ${memberResponse.status}`);
    }

    const editorResponse = await requestJson({
      method: 'GET',
      urlPath: '/api/community-settings/effective',
      token: editorIdentity.token,
    });
    if (editorResponse.status !== 200) {
      fail(`editor effective expected 200, got ${editorResponse.status}`);
      throw new Error('editor_effective_failed');
    }
    pass('editor can read community settings effective');

    const settings = editorResponse.json?.data;
    if (!isObjectLike(settings)) {
      fail('community settings effective payload missing data object');
      throw new Error('invalid_payload');
    }
    pass('community settings effective payload shape valid');

    for (const key of EXPECTED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        pass(`effective includes key: ${key}`);
      } else {
        fail(`effective missing key: ${key}`);
      }
    }

    const boolKeys = [
      'ugc_enabled',
      'guest_comments_enabled',
      'post_links_enabled',
      'comments_links_enabled',
      'citizen_card_visible',
      'badges_visible',
      'follow_system_enabled',
    ];
    for (const key of boolKeys) {
      if (typeof settings[key] === 'boolean') {
        pass(`key ${key} is boolean`);
      } else {
        fail(`key ${key} must be boolean`);
      }
    }

    const intKeys = ['post_link_limit', 'member_comment_link_limit', 'guest_comment_link_limit'];
    for (const key of intKeys) {
      if (Number.isInteger(settings[key]) && Number(settings[key]) >= 0) {
        pass(`key ${key} is non-negative integer`);
      } else {
        fail(`key ${key} must be non-negative integer`);
      }
    }

    if (['controlled', 'open'].includes(String(settings.ugc_open_mode || ''))) {
      pass('ugc_open_mode value is valid');
    } else {
      fail('ugc_open_mode value is invalid');
    }

    if (['public', 'members', 'private'].includes(String(settings.default_profile_visibility || ''))) {
      pass('default_profile_visibility value is valid');
    } else {
      fail('default_profile_visibility value is invalid');
    }

    if (['lenient', 'balanced', 'strict'].includes(String(settings.moderation_strictness || ''))) {
      pass('moderation_strictness value is valid');
    } else {
      fail('moderation_strictness value is invalid');
    }

    if (settings.notifications_defaults === null || isObjectLike(settings.notifications_defaults)) {
      pass('notifications_defaults shape is valid');
    } else {
      fail('notifications_defaults must be object or null');
    }

    if (settings.safety_notice_templates === null || isObjectLike(settings.safety_notice_templates)) {
      pass('safety_notice_templates shape is valid');
    } else {
      fail('safety_notice_templates must be object or null');
    }
  } finally {
    if (strapi) {
      await cleanup(strapi);
      await strapi.destroy();
    }
  }

  console.log('==============================================================');
  if (failCount > 0) {
    console.log(`COMMUNITY SETTINGS SMOKE: FAIL (${failCount} issue, ${passCount} pass)`);
    console.log('==============================================================');
    process.exitCode = 1;
    return;
  }
  console.log(`COMMUNITY SETTINGS SMOKE: PASS (${passCount} pass)`);
  console.log('==============================================================');
};

run().catch((error) => {
  console.error(`ERROR: ${error?.message || String(error)}`);
  process.exit(1);
});
