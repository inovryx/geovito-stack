'use strict';

const crypto = require('crypto');

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
