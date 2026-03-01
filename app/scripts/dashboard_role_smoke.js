'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');
const API_BASE = String(process.env.API_BASE || 'http://127.0.0.1:1337').replace(/\/$/, '');
const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
const TEMP_PASSWORD = 'TempPassw0rd!';

const DEFAULTS = {
  superPrimaryEmail: 'geovitoworld@gmail.com',
  superSecondaryEmail: 'ali.koc.00@gmail.com',
  altAdminEmail: 'admin.operator@geovito.com',
  altAdminRoleCode: 'geovito-alt-admin',
  memberEmail: 'member.user@geovito.com',
  ownerEmailHint: '',
};

const cfg = {
  superPrimaryEmail: String(process.env.SUPER_ADMIN_PRIMARY_EMAIL || DEFAULTS.superPrimaryEmail).trim().toLowerCase(),
  superSecondaryEmail: String(process.env.SUPER_ADMIN_SECONDARY_EMAIL || DEFAULTS.superSecondaryEmail).trim().toLowerCase(),
  altAdminEmail: String(process.env.ALT_ADMIN_EMAIL || DEFAULTS.altAdminEmail).trim().toLowerCase(),
  altAdminRoleCode: String(process.env.ALT_ADMIN_ROLE_CODE || DEFAULTS.altAdminRoleCode).trim(),
  memberEmail: String(process.env.MEMBER_USER_EMAIL || DEFAULTS.memberEmail).trim().toLowerCase(),
  ownerEmailHint: String(process.env.DASHBOARD_OWNER_EMAIL_HINT || DEFAULTS.ownerEmailHint).trim().toLowerCase(),
};

const ROLE_UID = 'plugin::users-permissions.role';
const USER_UID = 'plugin::users-permissions.user';

const created = {
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

const normalize = (value) => String(value || '').trim().toLowerCase();

const inferDashboardRole = (payload, sessionEmail, ownerHint) => {
  const roleRaw = normalize(payload?.role?.type || payload?.role?.name || payload?.role?.code);
  if (roleRaw.includes('super') || roleRaw.includes('admin') || roleRaw.includes('administrator')) return 'admin';
  if (roleRaw.includes('editor')) return 'editor';
  const email = normalize(payload?.email || sessionEmail || '');
  if (ownerHint && email === ownerHint) return 'owner';
  return 'member';
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

const requestJson = async ({ method = 'GET', urlPath, token = '' }) => {
  const headers = {
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${urlPath}`, { method, headers });
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
    role: Number(roleId),
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
      // best effort
    }
  }
};

const ensureAdminUserRole = async ({ strapi, email, expectedRoleCode, label }) => {
  const user = await strapi.db.query('admin::user').findOne({
    where: { email },
    populate: ['roles'],
  });
  if (!user) {
    fail(`${label} user missing (${email})`);
    return;
  }
  const roleCodes = (user.roles || []).map((role) => String(role.code || '').trim());
  if (roleCodes.includes(expectedRoleCode)) {
    pass(`${label} has role ${expectedRoleCode}`);
  } else {
    fail(`${label} expected role ${expectedRoleCode}, got [${roleCodes.join(', ')}]`);
  }
};

const run = async () => {
  let strapi;
  try {
    console.log('==============================================================');
    console.log('GEOVITO DASHBOARD ROLE SMOKE');
    console.log(`API_BASE=${API_BASE}`);
    console.log('==============================================================');

    if (!(await waitForApi())) {
      fail(`strapi readiness check failed (${API_BASE}/admin)`);
      throw new Error('api_not_ready');
    }
    pass('strapi readiness check');

    strapi = await createStrapiApp();

    await ensureAdminUserRole({
      strapi,
      email: cfg.superPrimaryEmail,
      expectedRoleCode: 'strapi-super-admin',
      label: 'super admin primary',
    });
    await ensureAdminUserRole({
      strapi,
      email: cfg.superSecondaryEmail,
      expectedRoleCode: 'strapi-super-admin',
      label: 'super admin secondary',
    });
    await ensureAdminUserRole({
      strapi,
      email: cfg.altAdminEmail,
      expectedRoleCode: cfg.altAdminRoleCode,
      label: 'alt admin',
    });

    const altRole = await strapi.db.query('admin::role').findOne({
      where: { code: cfg.altAdminRoleCode },
    });
    if (!altRole?.id) {
      fail(`alt admin role not found (${cfg.altAdminRoleCode})`);
    } else {
      const permissionCount = await strapi.db.query('admin::permission').count({
        where: { role: Number(altRole.id) },
      });
      if (permissionCount > 0) {
        pass(`alt admin role has permissions (${permissionCount})`);
      } else {
        fail('alt admin role permission count is zero');
      }
    }

    const authenticatedRole = await strapi.db.query(ROLE_UID).findOne({
      where: { type: 'authenticated' },
    });
    if (!authenticatedRole?.id) {
      fail('users-permissions authenticated role not found');
      throw new Error('authenticated_role_missing');
    }
    pass('users-permissions authenticated role resolved');

    const memberUser = await strapi.db.query(USER_UID).findOne({
      where: { email: cfg.memberEmail },
      populate: ['role'],
    });
    if (!memberUser?.id) {
      fail(`member user missing (${cfg.memberEmail})`);
    } else if (normalize(memberUser?.role?.type) === 'authenticated') {
      pass(`member user role is authenticated (${cfg.memberEmail})`);
    } else {
      fail(`member user role expected authenticated, got ${String(memberUser?.role?.type || 'unknown')}`);
    }

    const memberIdentity = await createUserAndToken({
      strapi,
      roleId: Number(authenticatedRole.id),
      username: `dash-member-${SUFFIX}`,
      email: `dash-member-${SUFFIX}@example.test`,
    });
    pass('temporary member session created');

    const memberMe = await requestJson({
      method: 'GET',
      urlPath: '/api/users/me?populate=role',
      token: memberIdentity.token,
    });

    if (memberMe.status === 200) {
      pass('member /api/users/me reachable');
    } else {
      fail(`member /api/users/me expected 200, got ${memberMe.status}`);
    }

    if (memberMe.json && typeof memberMe.json === 'object' && memberMe.json.role) {
      pass('member /api/users/me payload includes role relation');
    } else {
      pass('member /api/users/me payload omits role relation (dashboard falls back to member unless owner hint)');
    }

    const memberResolved = inferDashboardRole(memberMe.json, memberIdentity.user.email, cfg.ownerEmailHint);
    const expectedResolved = cfg.ownerEmailHint && normalize(memberIdentity.user.email) === cfg.ownerEmailHint ? 'owner' : 'member';

    if (memberResolved === expectedResolved) {
      pass(`member role inference valid (${memberResolved})`);
    } else {
      fail(`member role inference expected ${expectedResolved}, got ${memberResolved}`);
    }

    const ownerResolved = inferDashboardRole(memberMe.json, memberIdentity.user.email, normalize(memberIdentity.user.email));
    if (ownerResolved === 'owner') {
      pass('owner email override inference valid');
    } else {
      fail(`owner email override expected owner, got ${ownerResolved}`);
    }
  } finally {
    if (strapi) {
      await cleanup(strapi);
      await strapi.destroy();
    }
  }

  console.log('==============================================================');
  if (failCount > 0) {
    console.log(`DASHBOARD ROLE SMOKE: FAIL (${failCount} issue, ${passCount} pass)`);
    console.log('==============================================================');
    process.exitCode = 1;
    return;
  }
  console.log(`DASHBOARD ROLE SMOKE: PASS (${passCount} pass)`);
  console.log('==============================================================');
};

run().catch((error) => {
  console.error(`ERROR: ${error?.message || String(error)}`);
  process.exitCode = 1;
});
