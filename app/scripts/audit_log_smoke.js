'use strict';

const path = require('path');
const crypto = require('crypto');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');
const AUDIT_UID = 'api::audit-log.audit-log';
const REQUIRED_ACTIONS = String(process.env.AUDIT_REQUIRED_ACTIONS || 'community.settings.update,moderation.content_report.set')
  .split(',')
  .map((entry) => String(entry || '').trim())
  .filter(Boolean);

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

const run = async () => {
  const strapi = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });

  await strapi.load();
  try {
    const eventId = `audit-smoke-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const created = await strapi.entityService.create(AUDIT_UID, {
      data: {
        event_id: eventId,
        actor_user_id: null,
        actor_email: 'smoke@system.local',
        actor_role: 'system',
        action: 'audit.smoke.create',
        target_type: 'audit-log',
        target_ref: eventId,
        payload: { smoke: true },
      },
    });

    if (created?.id) {
      pass('audit log create works');
    } else {
      fail('audit log create failed');
    }

    try {
      await strapi.entityService.update(AUDIT_UID, Number(created.id), {
        data: {
          action: 'audit.smoke.mutated',
        },
      });
      fail('append-only guard failed (update unexpectedly succeeded)');
    } catch (_error) {
      pass('append-only guard blocks updates');
    }

    const recent = await strapi.entityService.findMany(AUDIT_UID, {
      publicationState: 'preview',
      fields: ['event_id', 'action', 'createdAt'],
      sort: ['createdAt:desc'],
      limit: 500,
    });

    const actionSet = new Set((Array.isArray(recent) ? recent : []).map((entry) => String(entry.action || '').trim()));
    for (const action of REQUIRED_ACTIONS) {
      if (actionSet.has(action)) {
        pass(`required action present: ${action}`);
      } else {
        fail(`required action missing: ${action}`);
      }
    }
  } finally {
    await strapi.destroy();
  }

  console.log('==============================================================');
  if (failCount > 0) {
    console.log(`AUDIT LOG SMOKE: FAIL (${failCount} fail, ${passCount} pass)`);
    console.log('==============================================================');
    process.exit(1);
  }

  console.log(`AUDIT LOG SMOKE: PASS (${passCount} pass)`);
  console.log('==============================================================');
};

run().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
