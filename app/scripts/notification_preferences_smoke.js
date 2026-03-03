'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');
const API_BASE = String(process.env.API_BASE || 'http://127.0.0.1:1337').replace(/\/$/, '');

const ROLE_UID = 'plugin::users-permissions.role';
const USER_UID = 'plugin::users-permissions.user';
const PERMISSION_UID = 'plugin::users-permissions.permission';
const PREFERENCE_UID = 'api::user-preference.user-preference';

const TEMP_PASSWORD = 'TempPassw0rd!';
const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
const DIGEST_VALUES = new Set(['off', 'instant', 'daily', 'weekly']);
const ONBOARDING_STATUS_VALUES = new Set(['in_progress', 'completed', 'skipped']);

const created = {
  userId: null,
};

const permissionSnapshot = [];

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

const deletePreferenceForUser = async (strapi, userId) => {
  if (!Number.isInteger(userId) || userId <= 0) return;
  const rows = await strapi.entityService.findMany(PREFERENCE_UID, {
    publicationState: 'preview',
    filters: { owner_user_id: userId },
    fields: ['id'],
    limit: 1,
  });
  const row = rows[0] || null;
  if (row?.id) {
    await strapi.entityService.delete(PREFERENCE_UID, Number(row.id));
  }
};

const cleanup = async (strapi) => {
  try {
    await deletePreferenceForUser(strapi, created.userId);
  } catch (_error) {
    // best effort
  }

  if (created.userId) {
    try {
      await strapi.entityService.delete(USER_UID, Number(created.userId));
    } catch (_error) {
      // best effort
    }
  }
};

const ensureUserPreferencePermissions = async (strapi, roleId) => {
  const actions = [
    'api::user-preference.user-preference.getMe',
    'api::user-preference.user-preference.upsertMe',
  ];

  const query = strapi.db.query(PERMISSION_UID);
  for (const action of actions) {
    const row = await query.findOne({
      where: {
        action,
        role: Number(roleId),
      },
    });

    if (row?.id) {
      permissionSnapshot.push({
        id: Number(row.id),
        action,
        existed: true,
        enabled: row.enabled === true,
      });
      if (row.enabled !== true) {
        await query.update({
          where: { id: Number(row.id) },
          data: { enabled: true },
        });
      }
      continue;
    }

    const createdPermission = await query.create({
      data: {
        action,
        role: Number(roleId),
        enabled: true,
      },
    });

    permissionSnapshot.push({
      id: Number(createdPermission.id),
      action,
      existed: false,
      enabled: false,
    });
  }
};

const restoreUserPreferencePermissions = async (strapi) => {
  const query = strapi.db.query(PERMISSION_UID);
  for (const snapshot of permissionSnapshot) {
    try {
      if (!snapshot.existed) {
        await query.delete({ where: { id: Number(snapshot.id) } });
        continue;
      }

      await query.update({
        where: { id: Number(snapshot.id) },
        data: { enabled: snapshot.enabled === true },
      });
    } catch (_error) {
      // best effort
    }
  }
};

const assertPreferenceShape = (payload, label) => {
  const row = payload && typeof payload === 'object' ? payload : {};
  const siteOk = typeof row.notifications_site_enabled === 'boolean';
  const emailOk = typeof row.notifications_email_enabled === 'boolean';
  const digestOk = DIGEST_VALUES.has(String(row.notifications_digest || ''));
  if (siteOk && emailOk && digestOk) {
    pass(`${label} includes valid notification preference shape`);
    return true;
  }

  fail(`${label} has invalid notification preference shape`);
  return false;
};

const assertOnboardingShape = (payload, label) => {
  const row = payload && typeof payload === 'object' ? payload : {};
  const onboarding =
    row.onboarding_progress && typeof row.onboarding_progress === 'object' ? row.onboarding_progress : null;
  const boolKeys = ['profile_completed', 'first_place_selected', 'first_post_started', 'share_prompt_seen', 'skipped'];

  if (!onboarding) {
    fail(`${label} is missing onboarding_progress`);
    return false;
  }

  for (const key of boolKeys) {
    if (typeof onboarding[key] !== 'boolean') {
      fail(`${label} onboarding_progress.${key} must be boolean`);
      return false;
    }
  }

  if (!Number.isInteger(onboarding.completed_steps) || !Number.isInteger(onboarding.total_steps)) {
    fail(`${label} onboarding progress counters are invalid`);
    return false;
  }

  if (!Number.isFinite(Number(onboarding.progress_percent))) {
    fail(`${label} onboarding_progress.progress_percent is invalid`);
    return false;
  }

  if (!ONBOARDING_STATUS_VALUES.has(String(onboarding.status || ''))) {
    fail(`${label} onboarding_progress.status is invalid`);
    return false;
  }

  pass(`${label} includes valid onboarding progress shape`);
  return true;
};

const run = async () => {
  let strapi;
  try {
    console.log('==============================================================');
    console.log('GEOVITO NOTIFICATION PREFERENCES SMOKE');
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
    await ensureUserPreferencePermissions(strapi, Number(authRole.id));
    pass('temporary user-preference permissions ensured for authenticated role');

    const memberIdentity = await createUserAndToken({
      strapi,
      roleId: Number(authRole.id),
      username: `pref-member-${SUFFIX}`,
      email: `pref-member-${SUFFIX}@example.test`,
    });
    pass('temporary member identity created');

    const initialGet = await requestJson({
      method: 'GET',
      urlPath: '/api/user-preferences/me',
      token: memberIdentity.token,
    });

    if (initialGet.status === 200) {
      pass('GET /api/user-preferences/me returns 200 for member');
    } else {
      fail(`GET /api/user-preferences/me expected 200, got ${initialGet.status}`);
    }
    assertPreferenceShape(initialGet.json?.data, 'initial GET');
    assertOnboardingShape(initialGet.json?.data, 'initial GET');

    const updateNotifications = await requestJson({
      method: 'PUT',
      urlPath: '/api/user-preferences/me',
      token: memberIdentity.token,
      body: {
        data: {
          notifications_site_enabled: false,
          notifications_email_enabled: true,
          notifications_digest: 'weekly',
        },
      },
    });

    if (updateNotifications.status === 200) {
      pass('notification-only update accepted');
    } else {
      fail(`notification-only update expected 200, got ${updateNotifications.status}`);
    }

    const updatedRow = updateNotifications.json?.data;
    if (
      updatedRow?.notifications_site_enabled === false &&
      updatedRow?.notifications_email_enabled === true &&
      updatedRow?.notifications_digest === 'weekly'
    ) {
      pass('notification-only update persisted expected values');
    } else {
      fail('notification-only update payload mismatch');
    }
    assertOnboardingShape(updateNotifications.json?.data, 'notification-only update');

    const updateOnboardingOnly = await requestJson({
      method: 'PUT',
      urlPath: '/api/user-preferences/me',
      token: memberIdentity.token,
      body: {
        data: {
          onboarding_progress: {
            profile_completed: true,
            first_place_selected: true,
          },
        },
      },
    });

    if (updateOnboardingOnly.status === 200) {
      pass('onboarding-only update accepted');
    } else {
      fail(`onboarding-only update expected 200, got ${updateOnboardingOnly.status}`);
    }

    const onboardingRow = updateOnboardingOnly.json?.data || {};
    assertOnboardingShape(onboardingRow, 'onboarding-only update');

    if (
      onboardingRow?.onboarding_progress?.profile_completed === true &&
      onboardingRow?.onboarding_progress?.first_place_selected === true
    ) {
      pass('onboarding-only update persisted expected progress flags');
    } else {
      fail('onboarding-only update did not persist expected progress flags');
    }

    if (
      onboardingRow?.notifications_site_enabled === false &&
      onboardingRow?.notifications_email_enabled === true &&
      onboardingRow?.notifications_digest === 'weekly'
    ) {
      pass('onboarding-only update kept existing notification preferences');
    } else {
      fail('onboarding-only update unexpectedly changed notification preferences');
    }

    const updateLanguageOnly = await requestJson({
      method: 'PUT',
      urlPath: '/api/user-preferences/me',
      token: memberIdentity.token,
      body: {
        data: {
          preferred_ui_language: 'tr',
        },
      },
    });

    if (updateLanguageOnly.status === 200) {
      pass('language-only update accepted');
    } else {
      fail(`language-only update expected 200, got ${updateLanguageOnly.status}`);
    }

    const languageRow = updateLanguageOnly.json?.data;
    if (languageRow?.preferred_ui_language === 'tr') {
      pass('language-only update persisted preferred language');
    } else {
      fail('language-only update did not persist preferred language');
    }
    assertOnboardingShape(languageRow, 'language-only update');

    if (
      languageRow?.notifications_site_enabled === false &&
      languageRow?.notifications_email_enabled === true &&
      languageRow?.notifications_digest === 'weekly'
    ) {
      pass('language-only update kept existing notification preferences');
    } else {
      fail('language-only update unexpectedly changed notification preferences');
    }

    if (
      languageRow?.onboarding_progress?.profile_completed === true &&
      languageRow?.onboarding_progress?.first_place_selected === true
    ) {
      pass('language-only update kept onboarding progress values');
    } else {
      fail('language-only update unexpectedly changed onboarding progress values');
    }

    const invalidDigest = await requestJson({
      method: 'PUT',
      urlPath: '/api/user-preferences/me',
      token: memberIdentity.token,
      body: {
        data: {
          notifications_digest: 'monthly',
        },
      },
    });

    if (invalidDigest.status === 400) {
      pass('invalid digest is rejected with 400');
    } else {
      fail(`invalid digest expected 400, got ${invalidDigest.status}`);
    }

    const invalidBoolean = await requestJson({
      method: 'PUT',
      urlPath: '/api/user-preferences/me',
      token: memberIdentity.token,
      body: {
        data: {
          notifications_email_enabled: 'sometimes',
        },
      },
    });

    if (invalidBoolean.status === 400) {
      pass('invalid notification boolean is rejected with 400');
    } else {
      fail(`invalid notification boolean expected 400, got ${invalidBoolean.status}`);
    }

    const invalidOnboarding = await requestJson({
      method: 'PUT',
      urlPath: '/api/user-preferences/me',
      token: memberIdentity.token,
      body: {
        data: {
          onboarding_progress: {
            profile_completed: 'sometimes',
          },
        },
      },
    });

    if (invalidOnboarding.status === 400) {
      pass('invalid onboarding progress value is rejected with 400');
    } else {
      fail(`invalid onboarding progress expected 400, got ${invalidOnboarding.status}`);
    }

    const finalGet = await requestJson({
      method: 'GET',
      urlPath: '/api/user-preferences/me',
      token: memberIdentity.token,
    });
    if (finalGet.status === 200) {
      pass('final GET returns 200');
    } else {
      fail(`final GET expected 200, got ${finalGet.status}`);
    }
    assertPreferenceShape(finalGet.json?.data, 'final GET');
    assertOnboardingShape(finalGet.json?.data, 'final GET');

    const finalData = finalGet.json?.data || {};
    if (
      finalData.preferred_ui_language === 'tr' &&
      finalData.notifications_site_enabled === false &&
      finalData.notifications_email_enabled === true &&
      finalData.notifications_digest === 'weekly'
    ) {
      pass('final preference state matches expected values');
    } else {
      fail('final preference state mismatch');
    }

    if (
      finalData?.onboarding_progress?.profile_completed === true &&
      finalData?.onboarding_progress?.first_place_selected === true
    ) {
      pass('final onboarding progress matches expected values');
    } else {
      fail('final onboarding progress mismatch');
    }

    console.log('==============================================================');
    if (failCount > 0) {
      console.log(`NOTIFICATION PREFERENCES SMOKE: FAIL (${failCount} failed, ${passCount} passed)`);
      console.log('==============================================================');
      process.exitCode = 1;
      return;
    }

    console.log(`NOTIFICATION PREFERENCES SMOKE: PASS (${passCount} checks)`);
    console.log('==============================================================');
  } catch (error) {
    if (failCount === 0) {
      fail(error?.message || 'unexpected_error');
    }
    console.log('==============================================================');
    console.log(`NOTIFICATION PREFERENCES SMOKE: FAIL (${failCount} failed, ${passCount} passed)`);
    console.log('==============================================================');
    process.exitCode = 1;
  } finally {
    if (strapi) {
      await restoreUserPreferencePermissions(strapi);
      await cleanup(strapi);
      await strapi.destroy();
    }
  }
};

run();
