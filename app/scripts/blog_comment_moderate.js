'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');
const { BLOG_COMMENT_STATUS } = require('../src/modules/blog-engagement/constants');

const UID = 'api::blog-comment.blog-comment';
const VALID_STATUSES = new Set(Object.values(BLOG_COMMENT_STATUS));

const usage = () => {
  console.log('Usage:');
  console.log('  node scripts/blog_comment_moderate.js list [--status pending] [--limit 20]');
  console.log('  node scripts/blog_comment_moderate.js set <comment_id> <status> [--notes "text"]');
  console.log('  node scripts/blog_comment_moderate.js next');
  console.log('  node scripts/blog_comment_moderate.js set-next <status> [--notes "text"] [--dry-run]');
  console.log('  node scripts/blog_comment_moderate.js bulk-set-next <status> [--limit 20] [--notes "text"] [--dry-run]');
  console.log('');
  console.log('Valid status values: pending, approved, rejected, spam, deleted');
};

const parseIntSafe = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const findByCommentId = async (strapi, commentId) => {
  const entries = await strapi.entityService.findMany(UID, {
    publicationState: 'preview',
    filters: {
      comment_id: commentId,
    },
    fields: [
      'id',
      'comment_id',
      'status',
      'source',
      'blog_post_ref',
      'createdAt',
      'moderation_notes',
      'reviewed_at',
      'reviewed_by',
    ],
    limit: 1,
  });

  return entries[0] || null;
};

const findOldestPending = async (strapi) => {
  const entries = await strapi.entityService.findMany(UID, {
    publicationState: 'preview',
    filters: {
      status: BLOG_COMMENT_STATUS.PENDING,
    },
    sort: ['createdAt:asc'],
    fields: [
      'id',
      'comment_id',
      'status',
      'source',
      'blog_post_ref',
      'createdAt',
      'moderation_notes',
      'reviewed_at',
      'reviewed_by',
    ],
    limit: 1,
  });

  return entries[0] || null;
};

const listComments = async (strapi, argv) => {
  let status = 'pending';
  let limit = 20;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--status') {
      status = String(argv[i + 1] || '').trim().toLowerCase();
      i += 1;
    } else if (token === '--limit') {
      limit = parseIntSafe(argv[i + 1], 20);
      i += 1;
    } else if (token === '-h' || token === '--help') {
      usage();
      return 0;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Invalid --status value: ${status}`);
  }

  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const entries = await strapi.entityService.findMany(UID, {
    publicationState: 'preview',
    filters: { status },
    sort: ['createdAt:asc'],
    fields: [
      'comment_id',
      'status',
      'source',
      'blog_post_ref',
      'createdAt',
      'moderation_notes',
      'reviewed_at',
      'reviewed_by',
    ],
    limit: safeLimit,
  });

  console.log('==============================================================');
  console.log('GEOVITO BLOG COMMENT MODERATION LIST');
  console.log('==============================================================');
  console.log(`status=${status} limit=${safeLimit} count=${entries.length}`);
  if (!entries.length) {
    console.log('no comments found');
    console.log('==============================================================');
    return 0;
  }

  for (const item of entries) {
    console.log(
      `${item.comment_id} | status=${item.status} | source=${item.source} | post=${item.blog_post_ref} | created=${item.createdAt}`
    );
  }
  console.log('==============================================================');
  return 0;
};

const setCommentStatus = async (strapi, argv) => {
  if (argv.length < 2) {
    throw new Error('set command requires: <comment_id> <status>');
  }

  const commentId = String(argv[0] || '').trim();
  const nextStatus = String(argv[1] || '').trim().toLowerCase();
  let notes;

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--notes') {
      notes = String(argv[i + 1] || '');
      i += 1;
    } else if (token === '-h' || token === '--help') {
      usage();
      return 0;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!commentId) {
    throw new Error('comment_id is required');
  }
  if (!VALID_STATUSES.has(nextStatus)) {
    throw new Error(`Invalid status: ${nextStatus}`);
  }

  const existing = await findByCommentId(strapi, commentId);
  if (!existing?.id) {
    throw new Error(`Comment not found: ${commentId}`);
  }

  const data = {
    status: nextStatus,
  };
  if (typeof notes === 'string') {
    data.moderation_notes = notes;
  }

  const updated = await strapi.entityService.update(UID, existing.id, {
    data,
    fields: [
      'comment_id',
      'status',
      'moderation_notes',
      'reviewed_at',
      'reviewed_by',
      'blog_post_ref',
      'source',
    ],
  });

  console.log('==============================================================');
  console.log('GEOVITO BLOG COMMENT MODERATION UPDATE');
  console.log('==============================================================');
  console.log(`comment_id=${updated.comment_id}`);
  console.log(`from=${existing.status} to=${updated.status}`);
  console.log(`source=${updated.source} post=${updated.blog_post_ref}`);
  console.log(`reviewed_at=${updated.reviewed_at || 'n/a'}`);
  console.log(`reviewed_by=${updated.reviewed_by || 'n/a'}`);
  console.log(`moderation_notes=${updated.moderation_notes || ''}`);
  console.log('==============================================================');
  return 0;
};

const printNextPending = async (strapi) => {
  const next = await findOldestPending(strapi);

  console.log('==============================================================');
  console.log('GEOVITO BLOG COMMENT MODERATION NEXT');
  console.log('==============================================================');

  if (!next?.id) {
    console.log('pending=0');
    console.log('no pending comment');
    console.log('==============================================================');
    return 0;
  }

  console.log(`comment_id=${next.comment_id}`);
  console.log(`status=${next.status}`);
  console.log(`source=${next.source}`);
  console.log(`post=${next.blog_post_ref}`);
  console.log(`created=${next.createdAt}`);
  console.log('==============================================================');
  return 0;
};

const setNextPendingStatus = async (strapi, argv) => {
  if (argv.length < 1) {
    throw new Error('set-next command requires: <status>');
  }

  const nextStatus = String(argv[0] || '').trim().toLowerCase();
  if (!VALID_STATUSES.has(nextStatus)) {
    throw new Error(`Invalid status: ${nextStatus}`);
  }
  if (nextStatus === BLOG_COMMENT_STATUS.PENDING) {
    throw new Error('set-next cannot set status back to pending');
  }

  let notes;
  let dryRun = false;
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--notes') {
      notes = String(argv[i + 1] || '');
      i += 1;
    } else if (token === '--dry-run') {
      dryRun = true;
    } else if (token === '-h' || token === '--help') {
      usage();
      return 0;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  const next = await findOldestPending(strapi);
  if (!next?.id) {
    console.log('==============================================================');
    console.log('GEOVITO BLOG COMMENT MODERATION UPDATE');
    console.log('==============================================================');
    console.log(`mode=set-next dry_run=${dryRun}`);
    console.log('pending=0');
    console.log('no pending comment');
    console.log('==============================================================');
    return 0;
  }

  if (dryRun) {
    console.log('==============================================================');
    console.log('GEOVITO BLOG COMMENT MODERATION UPDATE');
    console.log('==============================================================');
    console.log(`mode=set-next dry_run=true`);
    console.log(`comment_id=${next.comment_id}`);
    console.log(`from=${next.status} to=${nextStatus}`);
    console.log(`source=${next.source} post=${next.blog_post_ref}`);
    console.log(`would_change=true`);
    console.log(`moderation_notes=${typeof notes === 'string' ? notes : ''}`);
    console.log('==============================================================');
    return 0;
  }

  const data = {
    status: nextStatus,
  };
  if (typeof notes === 'string') {
    data.moderation_notes = notes;
  }

  const updated = await strapi.entityService.update(UID, next.id, {
    data,
    fields: [
      'comment_id',
      'status',
      'moderation_notes',
      'reviewed_at',
      'reviewed_by',
      'blog_post_ref',
      'source',
    ],
  });

  console.log('==============================================================');
  console.log('GEOVITO BLOG COMMENT MODERATION UPDATE');
  console.log('==============================================================');
  console.log(`mode=set-next dry_run=false`);
  console.log(`comment_id=${updated.comment_id}`);
  console.log(`from=${next.status} to=${updated.status}`);
  console.log(`source=${updated.source} post=${updated.blog_post_ref}`);
  console.log(`reviewed_at=${updated.reviewed_at || 'n/a'}`);
  console.log(`reviewed_by=${updated.reviewed_by || 'n/a'}`);
  console.log(`moderation_notes=${updated.moderation_notes || ''}`);
  console.log('==============================================================');
  return 0;
};

const setBulkNextPendingStatus = async (strapi, argv) => {
  if (argv.length < 1) {
    throw new Error('bulk-set-next command requires: <status>');
  }

  const nextStatus = String(argv[0] || '').trim().toLowerCase();
  if (!VALID_STATUSES.has(nextStatus)) {
    throw new Error(`Invalid status: ${nextStatus}`);
  }
  if (nextStatus === BLOG_COMMENT_STATUS.PENDING) {
    throw new Error('bulk-set-next cannot set status back to pending');
  }

  let notes;
  let limit = 20;
  let dryRun = false;
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--notes') {
      notes = String(argv[i + 1] || '');
      i += 1;
    } else if (token === '--limit') {
      limit = parseIntSafe(argv[i + 1], 20);
      i += 1;
    } else if (token === '--dry-run') {
      dryRun = true;
    } else if (token === '-h' || token === '--help') {
      usage();
      return 0;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const entries = await strapi.entityService.findMany(UID, {
    publicationState: 'preview',
    filters: {
      status: BLOG_COMMENT_STATUS.PENDING,
    },
    sort: ['createdAt:asc'],
    fields: ['id', 'comment_id', 'status', 'source', 'blog_post_ref', 'createdAt'],
    limit: safeLimit,
  });

  console.log('==============================================================');
  console.log('GEOVITO BLOG COMMENT MODERATION BULK UPDATE');
  console.log('==============================================================');
  console.log(`mode=bulk-set-next target_status=${nextStatus} limit=${safeLimit} dry_run=${dryRun}`);

  if (!entries.length) {
    console.log('pending=0');
    console.log('changed=0');
    if (dryRun) {
      console.log('would_change=0');
    }
    console.log('==============================================================');
    return 0;
  }

  if (dryRun) {
    console.log(`pending=${entries.length}`);
    console.log('changed=0');
    console.log(`would_change=${entries.length}`);
    for (const entry of entries) {
      console.log(`${entry.comment_id} | from=${entry.status} to=${nextStatus} | source=${entry.source} | post=${entry.blog_post_ref}`);
    }
    console.log(`moderation_notes=${typeof notes === 'string' ? notes : ''}`);
    console.log('==============================================================');
    return 0;
  }

  const changed = [];
  for (const entry of entries) {
    const data = { status: nextStatus };
    if (typeof notes === 'string') {
      data.moderation_notes = notes;
    }

    const updated = await strapi.entityService.update(UID, entry.id, {
      data,
      fields: ['comment_id', 'status', 'source', 'blog_post_ref', 'reviewed_at', 'reviewed_by'],
    });

    changed.push({
      comment_id: updated.comment_id,
      from: entry.status,
      to: updated.status,
      source: updated.source,
      post: updated.blog_post_ref,
    });
  }

  console.log(`pending=${entries.length}`);
  console.log(`changed=${changed.length}`);
  for (const item of changed) {
    console.log(`${item.comment_id} | from=${item.from} to=${item.to} | source=${item.source} | post=${item.post}`);
  }
  console.log('==============================================================');
  return 0;
};

const main = async () => {
  const argv = process.argv.slice(2);
  const command = String(argv[0] || '').trim().toLowerCase();

  if (!command || command === '-h' || command === '--help') {
    usage();
    return;
  }

  const strapi = await createAppInstance();
  try {
    if (command === 'list') {
      await listComments(strapi, argv.slice(1));
      return;
    }
    if (command === 'set') {
      await setCommentStatus(strapi, argv.slice(1));
      return;
    }
    if (command === 'next') {
      await printNextPending(strapi);
      return;
    }
    if (command === 'set-next') {
      await setNextPendingStatus(strapi, argv.slice(1));
      return;
    }
    if (command === 'bulk-set-next') {
      await setBulkNextPendingStatus(strapi, argv.slice(1));
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  } finally {
    await strapi.destroy();
  }
};

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
