'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');
const { writeAuditLog } = require('../src/modules/security/audit-log');

const APP_DIR = path.resolve(__dirname, '..');
const BLOG_POST_UID = 'api::blog-post.blog-post';

const run = async () => {
  const incidentId = String(process.env.INCIDENT_ID || '').trim();
  const approverEmail = String(process.env.APPROVER_EMAIL || '').trim().toLowerCase();
  const reason = String(process.env.REASON || '').trim();
  const snapshotRaw = String(process.env.SUBMITTED_VISIBILITY_SNAPSHOT_JSON || '').trim();

  if (!incidentId) throw new Error('INCIDENT_ID is required');
  if (!approverEmail) throw new Error('APPROVER_EMAIL is required');
  if (!reason) throw new Error('REASON is required');
  if (!snapshotRaw) throw new Error('SUBMITTED_VISIBILITY_SNAPSHOT_JSON is required');

  let snapshot;
  try {
    snapshot = JSON.parse(snapshotRaw);
  } catch (_error) {
    throw new Error('SUBMITTED_VISIBILITY_SNAPSHOT_JSON is invalid JSON');
  }

  const changedRows = Array.isArray(snapshot.changed) ? snapshot.changed : [];
  const restoreIds = changedRows
    .map((entry) => String(entry?.post_id || '').trim())
    .filter(Boolean);

  const strapi = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });

  await strapi.load();
  try {
    let restoredCount = 0;
    for (const postId of restoreIds) {
      const rows = await strapi.entityService.findMany(BLOG_POST_UID, {
        publicationState: 'preview',
        filters: { post_id: postId },
        fields: ['id', 'post_id', 'site_visibility'],
        limit: 1,
      });
      const row = rows[0] || null;
      if (!row?.id) continue;
      await strapi.entityService.update(BLOG_POST_UID, Number(row.id), {
        data: {
          site_visibility: 'visible',
        },
      });
      restoredCount += 1;
    }

    await writeAuditLog(strapi, {
      actor: {
        actorUserId: null,
        actorEmail: approverEmail,
        actorRole: 'system',
      },
      requestId: String(process.env.RUN_ID || process.env.REQUEST_ID || '').trim() || null,
      action: 'safety.submitted_visibility.restore',
      targetType: 'blog-post',
      targetRef: incidentId,
      payload: {
        incident_id: incidentId,
        reason,
        restored_count: restoredCount,
      },
    });

    console.log(`JSON_OUTPUT:${JSON.stringify({ incident_id: incidentId, restored_count: restoredCount })}`);
  } finally {
    await strapi.destroy();
  }
};

run().catch((error) => {
  console.error(`ERROR:${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
