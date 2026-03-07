'use strict';

const crypto = require('crypto');
const { log } = require('../domain-logging');

const AUDIT_UID = 'api::audit-log.audit-log';

const normalizeText = (value, maxLength = 220) => {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
};

const normalizeRole = (roleRaw) => {
  const value = String(roleRaw || '').trim().toLowerCase();
  if (!value) return 'member';
  if (value.includes('super')) return 'super-admin';
  if (value.includes('admin')) return 'admin';
  if (value.includes('editor')) return 'editor';
  if (value.includes('owner')) return 'owner';
  return value;
};

const resolveActorFromIdentity = (identity = null) => {
  const user = identity?.user || null;
  const roleRaw =
    identity?.roleRaw ||
    identity?.user?.role?.type ||
    identity?.user?.role?.name ||
    '';

  return {
    actorUserId: Number.isInteger(Number(user?.id)) ? Number(user.id) : null,
    actorEmail: normalizeText(user?.email, 200),
    actorRole: normalizeRole(roleRaw),
  };
};

const writeAuditLog = async (strapi, input = {}) => {
  if (!strapi || typeof strapi.entityService?.create !== 'function') {
    return false;
  }

  try {
    const actor = input.actor || {};
    const entry = {
      event_id: `audit-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
      actor_user_id: Number.isInteger(Number(actor.actorUserId)) ? Number(actor.actorUserId) : null,
      actor_email: normalizeText(actor.actorEmail, 200),
      actor_role: normalizeText(actor.actorRole || 'member', 120),
      action: normalizeText(input.action, 160) || 'unknown.action',
      target_type: normalizeText(input.targetType, 120),
      target_ref: normalizeText(input.targetRef, 220),
      payload: input.payload && typeof input.payload === 'object' ? input.payload : null,
    };

    await strapi.entityService.create(AUDIT_UID, { data: entry });

    await log(
      'ops',
      'INFO',
      `audit.${entry.action}`,
      `Audit action recorded: ${entry.action}`,
      {
        service: 'strapi',
        status: 200,
        actor_user_id: entry.actor_user_id,
        actor_role: entry.actor_role,
        action: entry.action,
        target_type: entry.target_type,
        target_ref: entry.target_ref,
      },
      {
        request_id: normalizeText(input.requestId || input.request_id, 160),
        actor: entry.actor_role || 'system',
        entity_ref: entry.target_ref,
        route_or_action: entry.action,
        channel: 'audit',
        user_ref:
          entry.actor_user_id !== null && entry.actor_user_id !== undefined
            ? `user:${entry.actor_user_id}`
            : normalizeText(entry.actor_email, 200),
      }
    );

    return true;
  } catch (error) {
    strapi.log?.warn?.(
      `[audit-log] write_failed action=${String(input.action || 'unknown')} message=${
        error instanceof Error ? error.message : String(error || 'unknown_error')
      }`
    );
    return false;
  }
};

module.exports = {
  resolveActorFromIdentity,
  writeAuditLog,
};
