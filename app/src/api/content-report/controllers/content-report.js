'use strict';

const crypto = require('crypto');
const { createCoreController } = require('@strapi/strapi').factories;
const { authenticateFromBearer } = require('../../../modules/blog-engagement/auth');
const { getClientIp, isLimited } = require('../../../modules/blog-engagement/rate-limit');
const { sanitizeText } = require('../../../modules/suggestions/sanitize');
const { resolveOwnerEmailHints, isOwnerEmail } = require('../../../modules/security/owner-emails');
const { resolveActorFromIdentity, writeAuditLog } = require('../../../modules/security/audit-log');

const UID = 'api::content-report.content-report';
const BLOG_COMMENT_UID = 'api::blog-comment.blog-comment';
const USER_UID = 'plugin::users-permissions.user';

const REPORT_REASON_SET = new Set(['spam', 'inappropriate', 'misinformation', 'copyright', 'other']);
const REPORT_STATUS_SET = new Set(['new', 'reviewing', 'resolved', 'dismissed']);
const OWNER_EMAIL_HINTS = resolveOwnerEmailHints(process.env);

const parseIntValue = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const REPORT_RATE_WINDOW_MS = parseIntValue(process.env.CONTENT_REPORT_RATE_WINDOW_MS, 10 * 60 * 1000, 1000, 3600000);
const REPORT_RATE_MAX = parseIntValue(process.env.CONTENT_REPORT_RATE_MAX, 10, 1, 500);
const AUTO_REVIEW_THRESHOLD = parseIntValue(process.env.CONTENT_REPORT_AUTO_REVIEW_THRESHOLD, 5, 1, 500);

const makeReportId = () => `report-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

const normalizeLower = (value) => String(value || '').trim().toLowerCase();
const normalizeReason = (value) => {
  const normalized = normalizeLower(value);
  return REPORT_REASON_SET.has(normalized) ? normalized : null;
};
const normalizeStatus = (value) => {
  const normalized = normalizeLower(value);
  return REPORT_STATUS_SET.has(normalized) ? normalized : null;
};

const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parsePayload = (ctx) => {
  const payload = ctx.request?.body?.data || ctx.request?.body || {};
  return payload && typeof payload === 'object' ? payload : {};
};

const resolveAuthUser = async (strapi, ctx) => {
  const baseUser = ctx.state?.user?.id ? ctx.state.user : await authenticateFromBearer(strapi, ctx);
  const userId = toPositiveInt(baseUser?.id);
  if (!userId) return null;

  const user = await strapi.entityService.findOne(USER_UID, userId, {
    fields: ['id', 'email', 'username', 'blocked'],
    populate: {
      role: {
        fields: ['id', 'type', 'name'],
      },
    },
  });
  if (!user || user.blocked === true) return null;
  return user;
};

const resolveModerationIdentity = async (strapi, ctx) => {
  const user = await resolveAuthUser(strapi, ctx);
  if (!user) return null;

  const roleRaw = normalizeLower(user?.role?.type || user?.role?.name || '');
  const isAdmin = roleRaw.includes('super') || roleRaw.includes('admin');
  const isEditor = isAdmin || roleRaw.includes('editor');
  const isOwner = isOwnerEmail(user.email, OWNER_EMAIL_HINTS);
  return {
    user,
    canModerate: isAdmin || isEditor || isOwner,
  };
};

const toPublicReport = (entry) => {
  if (!entry) return null;
  return {
    report_id: entry.report_id,
    target_type: entry.target_type,
    target_ref: entry.target_ref,
    reason: entry.reason,
    status: entry.status,
    auto_triggered: entry.auto_triggered === true,
    note: entry.note || null,
    resolution_note: entry.resolution_note || null,
    resolved_by: entry.resolved_by || null,
    resolved_at: entry.resolved_at || null,
    created_at: entry.createdAt || null,
    updated_at: entry.updatedAt || null,
  };
};

const bumpCommentReportCount = async (strapi, commentId) => {
  const rows = await strapi.entityService.findMany(BLOG_COMMENT_UID, {
    publicationState: 'preview',
    filters: {
      comment_id: commentId,
    },
    fields: ['id', 'comment_id', 'status', 'report_count', 'moderation_notes'],
    limit: 1,
  });

  const comment = rows[0] || null;
  if (!comment?.id) return;

  const nextCount = Math.max(0, Number(comment.report_count || 0)) + 1;
  const data = {
    report_count: nextCount,
  };

  if (nextCount >= AUTO_REVIEW_THRESHOLD && normalizeLower(comment.status) === 'approved') {
    data.status = 'pending';
    const nextNotes = String(comment.moderation_notes || '').trim();
    data.moderation_notes = nextNotes
      ? `${nextNotes}\nauto-hold: report_threshold_reached count=${nextCount}`
      : `auto-hold: report_threshold_reached count=${nextCount}`;
  }

  await strapi.entityService.update(BLOG_COMMENT_UID, Number(comment.id), { data });
};

module.exports = createCoreController(UID, ({ strapi }) => ({
  async submit(ctx) {
    const authUser = await resolveAuthUser(strapi, ctx);
    const payload = parsePayload(ctx);

    const clientIp = getClientIp(ctx);
    const rateKey = `content-report:${clientIp}:${authUser?.id || 'guest'}`;
    if (isLimited(rateKey, REPORT_RATE_WINDOW_MS, REPORT_RATE_MAX)) {
      ctx.status = 429;
      ctx.body = {
        data: null,
        error: {
          status: 429,
          name: 'RateLimitError',
          message: 'Too many reports. Please try later.',
          details: {},
        },
      };
      return;
    }

    const targetType = normalizeLower(payload.target_type);
    const targetRef = sanitizeText(payload.target_ref, 160);
    const reason = normalizeReason(payload.reason);
    const note = sanitizeText(payload.note, 2000) || null;

    if (!['post', 'comment', 'photo', 'profile'].includes(targetType)) {
      return ctx.badRequest('target_type is invalid');
    }
    if (!targetRef) {
      return ctx.badRequest('target_ref is required');
    }
    if (!reason) {
      return ctx.badRequest('reason is invalid');
    }

    const created = await strapi.entityService.create(UID, {
      data: {
        report_id: makeReportId(),
        target_type: targetType,
        target_ref: targetRef,
        reporter_user: authUser?.id ? Number(authUser.id) : null,
        reporter_user_id: authUser?.id ? Number(authUser.id) : null,
        reason,
        note,
        status: 'new',
        auto_triggered: false,
      },
    });

    if (targetType === 'comment') {
      await bumpCommentReportCount(strapi, targetRef);
    }

    ctx.status = 201;
    ctx.body = {
      data: toPublicReport(created),
    };
  },

  async moderationList(ctx) {
    const identity = await resolveModerationIdentity(strapi, ctx);
    if (!identity?.canModerate) {
      return ctx.forbidden('Moderation access denied.');
    }

    const statusFilter = normalizeStatus(ctx.query?.status);
    const limit = parseIntValue(ctx.query?.limit, 60, 1, 500);
    const filters = {};
    if (statusFilter) {
      filters.status = statusFilter;
    }

    const rows = await strapi.entityService.findMany(UID, {
      publicationState: 'preview',
      filters,
      fields: [
        'report_id',
        'target_type',
        'target_ref',
        'reason',
        'status',
        'auto_triggered',
        'note',
        'resolution_note',
        'resolved_by',
        'resolved_at',
        'createdAt',
        'updatedAt',
      ],
      sort: ['createdAt:asc'],
      limit,
    });

    ctx.body = {
      data: Array.isArray(rows) ? rows.map(toPublicReport) : [],
    };
  },

  async moderationSet(ctx) {
    const identity = await resolveModerationIdentity(strapi, ctx);
    if (!identity?.canModerate) {
      return ctx.forbidden('Moderation access denied.');
    }

    const payload = parsePayload(ctx);
    const reportId = sanitizeText(payload.report_id, 120);
    const nextStatus = normalizeStatus(payload.next_status);
    const resolutionNote = sanitizeText(payload.resolution_note, 2000) || null;

    if (!reportId) {
      return ctx.badRequest('report_id is required');
    }
    if (!nextStatus || !['reviewing', 'resolved', 'dismissed'].includes(nextStatus)) {
      return ctx.badRequest('next_status is invalid');
    }

    const existingRows = await strapi.entityService.findMany(UID, {
      publicationState: 'preview',
      filters: { report_id: reportId },
      fields: ['id', 'report_id', 'status'],
      limit: 1,
    });
    const existing = existingRows[0] || null;
    if (!existing?.id) {
      return ctx.notFound('Report not found');
    }

    const data = {
      status: nextStatus,
      resolution_note: resolutionNote,
    };
    if (['resolved', 'dismissed'].includes(nextStatus)) {
      data.resolved_by = Number(identity.user.id);
      data.resolved_at = new Date().toISOString();
    } else {
      data.resolved_by = null;
      data.resolved_at = null;
    }

    const updated = await strapi.entityService.update(UID, Number(existing.id), {
      data,
      fields: [
        'report_id',
        'target_type',
        'target_ref',
        'reason',
        'status',
        'auto_triggered',
        'note',
        'resolution_note',
        'resolved_by',
        'resolved_at',
        'createdAt',
        'updatedAt',
      ],
    });

    await writeAuditLog(strapi, {
      actor: resolveActorFromIdentity({
        user: identity.user,
        roleRaw: identity.user?.role?.type || identity.user?.role?.name || '',
      }),
      requestId: ctx.state?.requestId || null,
      action: 'moderation.content_report.set',
      targetType: 'content-report',
      targetRef: updated.report_id,
      payload: {
        from_status: existing.status,
        to_status: updated.status,
      },
    });

    ctx.body = {
      data: toPublicReport(updated),
    };
  },
}));
