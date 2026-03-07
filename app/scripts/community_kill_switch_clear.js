'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');
const { getCommunitySettings, upsertCommunitySettings, sanitizePartialSettings } = require('../src/modules/community-settings');
const { writeAuditLog } = require('../src/modules/security/audit-log');

const APP_DIR = path.resolve(__dirname, '..');

const run = async () => {
  const snapshotRaw = String(process.env.KILL_SWITCH_SNAPSHOT_JSON || '').trim();
  if (!snapshotRaw) {
    throw new Error('KILL_SWITCH_SNAPSHOT_JSON is required');
  }

  let snapshotPayload;
  try {
    snapshotPayload = JSON.parse(snapshotRaw);
  } catch (_error) {
    throw new Error('KILL_SWITCH_SNAPSHOT_JSON is not valid JSON');
  }

  const snapshot =
    snapshotPayload &&
    typeof snapshotPayload === 'object' &&
    !Array.isArray(snapshotPayload)
      ? (snapshotPayload.baseline && typeof snapshotPayload.baseline === 'object'
          ? snapshotPayload.baseline
          : snapshotPayload.before && typeof snapshotPayload.before === 'object'
            ? snapshotPayload.before
            : snapshotPayload)
      : null;

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('KILL_SWITCH_SNAPSHOT_JSON does not contain valid baseline/before payload');
  }

  const strapi = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });

  await strapi.load();
  try {
    const before = await getCommunitySettings(strapi, { refresh: true });
    const patch = sanitizePartialSettings(snapshot);
    if (Object.keys(patch).length === 0) {
      throw new Error('snapshot has no valid community settings keys');
    }

    const after = await upsertCommunitySettings(strapi, patch);

    await writeAuditLog(strapi, {
      actor: {
        actorUserId: null,
        actorEmail: String(process.env.OPERATOR_EMAIL || 'ops@system.local'),
        actorRole: 'system',
      },
      requestId: String(process.env.RUN_ID || process.env.REQUEST_ID || '').trim() || null,
      action: 'safety.kill_switch.clear',
      targetType: 'community-setting',
      targetRef: 'effective',
      payload: {
        incident_id: String(process.env.INCIDENT_ID || ''),
        reason: String(process.env.REASON || ''),
        restored_keys: Object.keys(patch),
      },
    });

    console.log(`JSON_OUTPUT:${JSON.stringify({ before, after })}`);
  } finally {
    await strapi.destroy();
  }
};

run().catch((error) => {
  console.error(`ERROR:${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
