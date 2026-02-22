'use strict';

const crypto = require('crypto');
const { createCoreService } = require('@strapi/strapi').factories;

const UID = 'api::blog-comment.blog-comment';

const makeCommentId = () =>
  `comment-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

module.exports = createCoreService(UID, ({ strapi }) => ({
  async createFromPublicSubmission({
    payload,
    source,
    status,
    blogPost,
    user,
    clientIpHash,
    moderationNotes = null,
  }) {
    return strapi.entityService.create(UID, {
      data: {
        comment_id: makeCommentId(),
        status,
        source,
        body: payload.body,
        language: payload.language || 'en',
        blog_post: blogPost.id,
        blog_post_ref: blogPost.post_id,
        guest_display_name: source === 'guest' ? payload.guest_display_name || null : null,
        guest_email: source === 'guest' ? payload.guest_email || null : null,
        owner_user: user?.id || null,
        owner_user_id: user?.id ? Number(user.id) : null,
        owner_username: user?.username || null,
        client_ip_hash: clientIpHash,
        moderation_notes: moderationNotes,
      },
    });
  },
}));
