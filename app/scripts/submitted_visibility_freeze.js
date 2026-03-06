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

  if (!incidentId) throw new Error('INCIDENT_ID is required');
  if (!approverEmail) throw new Error('APPROVER_EMAIL is required');
  if (!reason) throw new Error('REASON is required');

  const strapi = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });

  await strapi.load();
  try {
    const rows = await strapi.entityService.findMany(BLOG_POST_UID, {
      publicationState: 'preview',
      filters: {
        content_source: 'user',
        submission_state: 'submitted',
        site_visibility: 'visible',
      },
      fields: ['id', 'post_id', 'site_visibility'],
      limit: 2000,
    });

    const changed = [];
    for (const row of rows) {
      await strapi.entityService.update(BLOG_POST_UID, Number(row.id), {
        data: {
          site_visibility: 'hidden',
          review_flags: {
            ...(row.review_flags && typeof row.review_flags === 'object' ? row.review_flags : {}),
            emergency_hidden: true,
            incident_id: incidentId,
            reason,
          },
        },
      });
      changed.push({
        post_id: row.post_id,
        previous_visibility: row.site_visibility || 'visible',
      });
    }

    await writeAuditLog(strapi, {
      actor: {
        actorUserId: null,
        actorEmail: approverEmail,
        actorRole: 'system',
      },
      action: 'safety.submitted_visibility.freeze',
      targetType: 'blog-post',
      targetRef: incidentId,
      payload: {
        incident_id: incidentId,
        reason,
        changed_count: changed.length,
      },
    });

    console.log(
      `JSON_OUTPUT:${JSON.stringify({
        incident_id: incidentId,
        approver_email: approverEmail,
        reason,
        changed,
      })}`
    );
  } finally {
    await strapi.destroy();
  }
};

run().catch((error) => {
  console.error(`ERROR:${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
