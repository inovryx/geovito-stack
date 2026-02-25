'use strict';

const REVISION_UID = 'api::blog-post-revision.blog-post-revision';
const DEFAULT_LIMIT = 5;

const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const snapshotBlogPost = (post) => {
  if (!post || typeof post !== 'object') return null;
  return {
    id: Number(post.id) || null,
    post_id: post.post_id || null,
    canonical_language: post.canonical_language || 'en',
    original_language: post.original_language || post.canonical_language || 'en',
    content_source: post.content_source || 'editorial',
    submission_state: post.submission_state || 'approved',
    site_visibility: post.site_visibility || 'visible',
    owner_user_id: post.owner_user_id || null,
    owner_username_snapshot: post.owner_username_snapshot || null,
    moderation_notes: post.moderation_notes || null,
    reviewed_at: post.reviewed_at || null,
    reviewed_by: post.reviewed_by || null,
    published_on: post.published_on || null,
    publishedAt: post.publishedAt || null,
    mock: post.mock === true,
    related_place_refs: Array.isArray(post.related_place_refs) ? post.related_place_refs : [],
    tags: Array.isArray(post.tags) ? post.tags : [],
    review_flags: post.review_flags || null,
    translations: Array.isArray(post.translations) ? post.translations : [],
    captured_at: new Date().toISOString(),
  };
};

const createRevision = async (strapi, options = {}) => {
  const post = options.post || null;
  const action = String(options.action || '').trim().toLowerCase();
  const changedBy = toPositiveInt(options.changedBy);
  const maxRevisions = Math.max(
    1,
    toPositiveInt(process.env.BLOG_POST_REVISION_LIMIT) || DEFAULT_LIMIT
  );

  if (!post?.id || !post?.post_id) return null;
  if (!['create', 'update', 'submit', 'moderate', 'visibility'].includes(action)) return null;

  const snapshot = snapshotBlogPost(post);
  if (!snapshot) return null;

  const created = await strapi.entityService.create(REVISION_UID, {
    data: {
      post_id: String(post.post_id),
      entity_id: Number(post.id),
      action,
      changed_by: changedBy,
      snapshot,
    },
  });

  const rows = await strapi.entityService.findMany(REVISION_UID, {
    filters: {
      post_id: String(post.post_id),
    },
    fields: ['id'],
    sort: ['createdAt:desc'],
    limit: 100,
  });

  const staleRows = Array.isArray(rows) ? rows.slice(maxRevisions) : [];
  for (const row of staleRows) {
    if (!row?.id) continue;
    try {
      await strapi.entityService.delete(REVISION_UID, Number(row.id));
    } catch (_error) {
      // best-effort cleanup
    }
  }

  return created;
};

module.exports = {
  createRevision,
  snapshotBlogPost,
};

