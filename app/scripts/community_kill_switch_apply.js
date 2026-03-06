'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');
const { getCommunitySettings, upsertCommunitySettings } = require('../src/modules/community-settings');
const { writeAuditLog } = require('../src/modules/security/audit-log');

const APP_DIR = path.resolve(__dirname, '..');

const run = async () => {
  const strapi = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });

  await strapi.load();
  try {
    const before = await getCommunitySettings(strapi, { refresh: true });
    const patch = {
      ugc_enabled: false,
      guest_comments_enabled: false,
      post_links_enabled: false,
      comments_links_enabled: false,
      post_link_limit: 0,
      member_comment_link_limit: 0,
      guest_comment_link_limit: 0,
      moderation_strictness: 'strict',
    };

    const after = await upsertCommunitySettings(strapi, patch);

    await writeAuditLog(strapi, {
      actor: {
        actorUserId: null,
        actorEmail: String(process.env.OPERATOR_EMAIL || 'ops@system.local'),
        actorRole: 'system',
      },
      action: 'safety.kill_switch.apply',
      targetType: 'community-setting',
      targetRef: 'effective',
      payload: {
        incident_id: String(process.env.INCIDENT_ID || ''),
        reason: String(process.env.REASON || ''),
        changed_keys: Object.keys(patch),
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
