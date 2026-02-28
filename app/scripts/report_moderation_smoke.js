'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');
const API_BASE = String(process.env.API_BASE || 'http://127.0.0.1:1337').replace(/\/$/, '');

const ROLE_UID = 'plugin::users-permissions.role';
const USER_UID = 'plugin::users-permissions.user';
const REPORT_UID = 'api::content-report.content-report';

const TEMP_PASSWORD = 'TempPassw0rd!';
const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);

const created = {
  roleId: null,
  userIds: [],
  reportIds: [],
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

const reportExists = async (strapi, reportId) => {
  const rows = await strapi.entityService.findMany(REPORT_UID, {
    publicationState: 'preview',
    filters: {
      report_id: String(reportId || ''),
    },
    fields: ['id', 'report_id'],
    limit: 1,
  });
  return rows[0] || null;
};

const cleanup = async (strapi) => {
  for (const reportId of created.reportIds) {
    try {
      const row = await reportExists(strapi, reportId);
      if (row?.id) {
        await strapi.entityService.delete(REPORT_UID, Number(row.id));
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

const run = async () => {
  let strapi;
  try {
    console.log('==============================================================');
    console.log('GEOVITO REPORT MODERATION SMOKE');
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
        name: `Report Editor ${SUFFIX}`,
        description: 'temporary role for report moderation smoke',
        type: `report-editor-${SUFFIX}`,
      },
    });
    created.roleId = Number(editorRole.id);
    pass('temporary editor role created');

    const memberIdentity = await createUserAndToken({
      strapi,
      roleId: Number(authRole.id),
      username: `report-member-${SUFFIX}`,
      email: `report-member-${SUFFIX}@example.test`,
    });
    pass('temporary member identity created');

    const editorIdentity = await createUserAndToken({
      strapi,
      roleId: Number(editorRole.id),
      username: `report-editor-${SUFFIX}`,
      email: `report-editor-${SUFFIX}@example.test`,
    });
    pass('temporary editor identity created');

    const submitResponse = await requestJson({
      method: 'POST',
      urlPath: '/api/content-reports/submit',
      token: memberIdentity.token,
      body: {
        target_type: 'post',
        target_ref: `smoke-post-${SUFFIX}`,
        reason: 'other',
        note: 'report moderation smoke',
      },
    });

    const reportId = String(submitResponse.json?.data?.report_id || '');
    if (submitResponse.status === 201 && reportId) {
      created.reportIds.push(reportId);
      pass('member report submission accepted');
    } else {
      fail(`member report submission expected 201, got ${submitResponse.status}`);
    }

    const memberList = await requestJson({
      method: 'GET',
      urlPath: '/api/content-reports/moderation/list?status=new&limit=20',
      token: memberIdentity.token,
    });
    if (memberList.status === 403) {
      pass('member cannot access report moderation list');
    } else {
      fail(`member moderation list expected 403, got ${memberList.status}`);
    }

    const editorList = await requestJson({
      method: 'GET',
      urlPath: '/api/content-reports/moderation/list?status=new&limit=50',
      token: editorIdentity.token,
    });
    const editorRows = Array.isArray(editorList.json?.data) ? editorList.json.data : [];
    if (editorList.status === 200) {
      pass('editor can access report moderation list');
    } else {
      fail(`editor moderation list expected 200, got ${editorList.status}`);
    }
    if (reportId && editorRows.some((row) => String(row?.report_id || '') === reportId)) {
      pass('submitted report appears in moderation list');
    } else {
      fail('submitted report missing in moderation list');
    }

    const setReviewing = await requestJson({
      method: 'POST',
      urlPath: '/api/content-reports/moderation/set',
      token: editorIdentity.token,
      body: {
        report_id: reportId,
        next_status: 'reviewing',
        resolution_note: 'triage started',
      },
    });
    if (setReviewing.status === 200 && String(setReviewing.json?.data?.status || '') === 'reviewing') {
      pass('editor can move report to reviewing');
    } else {
      fail(`editor moderation set reviewing expected 200, got ${setReviewing.status}`);
    }

    const setResolved = await requestJson({
      method: 'POST',
      urlPath: '/api/content-reports/moderation/set',
      token: editorIdentity.token,
      body: {
        report_id: reportId,
        next_status: 'resolved',
        resolution_note: 'resolved by smoke',
      },
    });
    if (setResolved.status === 200 && String(setResolved.json?.data?.status || '') === 'resolved') {
      pass('editor can resolve report');
    } else {
      fail(`editor moderation set resolved expected 200, got ${setResolved.status}`);
    }
  } finally {
    if (strapi) {
      await cleanup(strapi);
      await strapi.destroy();
    }
  }

  console.log('==============================================================');
  if (failCount > 0) {
    console.log(`REPORT MODERATION SMOKE: FAIL (${failCount} issue, ${passCount} pass)`);
    console.log('==============================================================');
    process.exitCode = 1;
    return;
  }
  console.log(`REPORT MODERATION SMOKE: PASS (${passCount} pass)`);
  console.log('==============================================================');
};

run().catch((error) => {
  console.error(`ERROR: ${error?.message || String(error)}`);
  process.exit(1);
});
