'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');
const { BLOG_COMMENT_STATUS } = require('../src/modules/blog-engagement/constants');

const UID = 'api::blog-comment.blog-comment';
const REPORT_STATUSES = [
  BLOG_COMMENT_STATUS.PENDING,
  BLOG_COMMENT_STATUS.APPROVED,
  BLOG_COMMENT_STATUS.REJECTED,
  BLOG_COMMENT_STATUS.SPAM,
  BLOG_COMMENT_STATUS.DELETED,
];

const isTrue = (value) =>
  String(value || '')
    .trim()
    .toLowerCase() === 'true';

const parseHours = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
};

const createAppInstance = async () => {
  const appDir = path.resolve(__dirname, '..');
  const strapi = createStrapi({
    appDir,
    distDir: appDir,
    autoReload: false,
    serveAdminPanel: false,
  });
  await strapi.load();
  return strapi;
};

const countByStatus = async (strapi, status) =>
  strapi.db.query(UID).count({
    where: { status },
  });

const getOldestPending = async (strapi) => {
  const entries = await strapi.entityService.findMany(UID, {
    filters: { status: BLOG_COMMENT_STATUS.PENDING },
    sort: ['createdAt:asc'],
    limit: 1,
    fields: [
      'comment_id',
      'createdAt',
      'source',
      'blog_post_ref',
      'guest_display_name',
      'owner_username',
    ],
  });

  return entries[0] || null;
};

const getRecentPending = async (strapi) =>
  strapi.entityService.findMany(UID, {
    filters: { status: BLOG_COMMENT_STATUS.PENDING },
    sort: ['createdAt:asc'],
    limit: 10,
    fields: [
      'comment_id',
      'createdAt',
      'source',
      'blog_post_ref',
      'guest_display_name',
      'owner_username',
      'moderation_notes',
    ],
  });

const formatAgeHours = (createdAt, nowMs) => {
  if (!createdAt) return null;
  const thenMs = new Date(createdAt).getTime();
  if (!Number.isFinite(thenMs)) return null;
  return Math.max(0, Math.floor((nowMs - thenMs) / (1000 * 60 * 60)));
};

const parseFlag = (argv, name) => argv.includes(name);

const main = async () => {
  const argv = process.argv.slice(2);
  const asJson = parseFlag(argv, '--json');
  const failOnStalePending =
    parseFlag(argv, '--fail-on-stale-pending') || isTrue(process.env.BLOG_MOD_FAIL_ON_STALE_PENDING);
  const alertHours = parseHours(process.env.BLOG_MOD_PENDING_ALERT_HOURS, 24);
  const nowMs = Date.now();

  const strapi = await createAppInstance();
  try {
    const counts = {};
    for (const status of REPORT_STATUSES) {
      counts[status] = await countByStatus(strapi, status);
    }

    const total = Object.values(counts).reduce((sum, current) => sum + Number(current || 0), 0);
    const oldestPending = await getOldestPending(strapi);
    const oldestAgeHours = oldestPending ? formatAgeHours(oldestPending.createdAt, nowMs) : null;
    const stalePendingDetected = Number.isFinite(oldestAgeHours) && oldestAgeHours >= alertHours;
    const recentPending = counts.pending > 0 ? await getRecentPending(strapi) : [];

    const report = {
      generated_at: new Date(nowMs).toISOString(),
      alert_pending_hours: alertHours,
      fail_on_stale_pending: failOnStalePending,
      stale_pending_detected: stalePendingDetected,
      totals: {
        all: total,
        ...counts,
      },
      oldest_pending: oldestPending
        ? {
            comment_id: oldestPending.comment_id,
            source: oldestPending.source,
            blog_post_ref: oldestPending.blog_post_ref,
            created_at: oldestPending.createdAt,
            age_hours: oldestAgeHours,
            display_name:
              oldestPending.source === 'registered'
                ? oldestPending.owner_username || null
                : oldestPending.guest_display_name || null,
            above_alert_threshold: stalePendingDetected,
          }
        : null,
      pending_sample: Array.isArray(recentPending)
        ? recentPending.map((entry) => ({
            comment_id: entry.comment_id,
            source: entry.source,
            blog_post_ref: entry.blog_post_ref,
            created_at: entry.createdAt,
            age_hours: formatAgeHours(entry.createdAt, nowMs),
            display_name:
              entry.source === 'registered'
                ? entry.owner_username || null
                : entry.guest_display_name || null,
            moderation_notes: entry.moderation_notes || null,
          }))
        : [],
    };

    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
      if (failOnStalePending && stalePendingDetected) {
        process.exit(2);
      }
      return;
    }

    console.log('==============================================================');
    console.log('GEOVITO BLOG MODERATION REPORT');
    console.log('==============================================================');
    console.log(`generated_at=${report.generated_at}`);
    console.log(`alert_pending_hours=${report.alert_pending_hours}`);
    console.log(`fail_on_stale_pending=${report.fail_on_stale_pending}`);
    console.log(`stale_pending_detected=${report.stale_pending_detected}`);
    console.log(`total=${report.totals.all}`);
    console.log(`pending=${report.totals.pending}`);
    console.log(`approved=${report.totals.approved}`);
    console.log(`rejected=${report.totals.rejected}`);
    console.log(`spam=${report.totals.spam}`);
    console.log(`deleted=${report.totals.deleted}`);

    if (!report.oldest_pending) {
      console.log('oldest_pending=none');
    } else {
      console.log(
        `oldest_pending=${report.oldest_pending.comment_id} age_hours=${report.oldest_pending.age_hours} source=${report.oldest_pending.source} threshold_exceeded=${report.oldest_pending.above_alert_threshold}`
      );
    }

    if (report.pending_sample.length > 0) {
      console.log('pending_sample_top10:');
      for (const row of report.pending_sample) {
        console.log(
          `- ${row.comment_id} post=${row.blog_post_ref} source=${row.source} age_h=${row.age_hours} name=${row.display_name || 'n/a'}`
        );
      }
    }

    console.log('==============================================================');
    if (failOnStalePending && stalePendingDetected) {
      console.log('BLOG MODERATION REPORT: FAIL (stale pending threshold exceeded)');
      console.log('==============================================================');
      process.exit(2);
    }
    console.log('BLOG MODERATION REPORT: PASS');
    console.log('==============================================================');
  } finally {
    await strapi.destroy();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
