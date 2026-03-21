'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createStrapi } = require('@strapi/core');
const { writeAuditLog } = require('../src/modules/security/audit-log');

const APP_DIR = path.resolve(__dirname, '..');
const AUDIT_UID = 'api::audit-log.audit-log';
const REQUIRED_ACTIONS = String(process.env.AUDIT_REQUIRED_ACTIONS || 'community.settings.update,moderation.content_report.set')
  .split(',')
  .map((entry) => String(entry || '').trim())
  .filter(Boolean);
const STRICT_MODE = ['1', 'true', 'yes', 'on'].includes(String(process.env.AUDIT_SMOKE_STRICT || '').trim().toLowerCase());

let passCount = 0;
let failCount = 0;

const pass = (message) => {
  passCount += 1;
  console.log(`PASS: ${message}`);
};

const fail = (message) => {
  failCount += 1;
  console.log(`FAIL: ${message}`);
};

const collectActionSet = (rows) =>
  new Set((Array.isArray(rows) ? rows : []).map((entry) => String(entry.action || '').trim()).filter(Boolean));

const collectAuditChannelActionSet = (auditChannelFile) => {
  if (!fs.existsSync(auditChannelFile)) {
    return null;
  }

  const lines = fs
    .readFileSync(auditChannelFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4000);

  const channelActions = new Set();
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (String(row?.channel || '') !== 'audit') continue;
      const action = String(row?.route_or_action || row?.meta?.action || '').trim();
      if (action) channelActions.add(action);
    } catch {
      // ignore malformed lines in smoke
    }
  }
  return channelActions;
};

const run = async () => {
  const strapi = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });

  await strapi.load();
  try {
    const eventId = `audit-smoke-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const created = await strapi.entityService.create(AUDIT_UID, {
      data: {
        event_id: eventId,
        actor_user_id: null,
        actor_email: 'smoke@system.local',
        actor_role: 'system',
        action: 'audit.smoke.create',
        target_type: 'audit-log',
        target_ref: eventId,
        payload: { smoke: true },
      },
    });

    if (created?.id) {
      pass('audit log create works');
    } else {
      fail('audit log create failed');
    }

    try {
      await strapi.entityService.update(AUDIT_UID, Number(created.id), {
        data: {
          action: 'audit.smoke.mutated',
        },
      });
      fail('append-only guard failed (update unexpectedly succeeded)');
    } catch (_error) {
      pass('append-only guard blocks updates');
    }

    const recentBeforeStrict = await strapi.entityService.findMany(AUDIT_UID, {
      publicationState: 'preview',
      fields: ['event_id', 'action', 'createdAt'],
      sort: ['createdAt:desc'],
      limit: 1200,
    });
    const actionSetBeforeStrict = collectActionSet(recentBeforeStrict);

    if (STRICT_MODE) {
      const strictRequestId = `audit-smoke-strict-${Date.now().toString(36)}`;
      for (const action of REQUIRED_ACTIONS) {
        if (actionSetBeforeStrict.has(action)) continue;
        const ok = await writeAuditLog(strapi, {
          actor: {
            actorUserId: null,
            actorEmail: 'strict-smoke@system.local',
            actorRole: 'system',
          },
          requestId: strictRequestId,
          action,
          targetType: 'strict-audit-smoke',
          targetRef: action,
          payload: {
            source: 'audit_log_smoke_strict_seed',
            reason: 'required_action_missing',
          },
        });
        if (ok) {
          pass(`strict seed action emitted: ${action}`);
        } else {
          fail(`strict seed action failed: ${action}`);
        }
      }
    }

    let recent = await strapi.entityService.findMany(AUDIT_UID, {
      publicationState: 'preview',
      fields: ['event_id', 'action', 'createdAt'],
      sort: ['createdAt:desc'],
      limit: 2000,
    });

    const contractRoot = process.env.LOG_CONTRACT_FILE_ROOT
      ? path.resolve(process.env.LOG_CONTRACT_FILE_ROOT)
      : path.resolve(APP_DIR, '..', 'logs', 'channels');
    const auditChannelFile = path.join(contractRoot, 'audit.jsonl');
    if (!fs.existsSync(auditChannelFile)) {
      fail(`audit channel file not found: ${auditChannelFile}`);
    } else {
      let actionSet = collectActionSet(recent);
      let channelActions = collectAuditChannelActionSet(auditChannelFile);
      if (!channelActions) {
        fail(`audit channel file not found: ${auditChannelFile}`);
      } else {
        if (STRICT_MODE) {
          const strictRequestId = `audit-smoke-strict-sync-${Date.now().toString(36)}`;
          let seededForSync = 0;
          for (const action of REQUIRED_ACTIONS) {
            if (actionSet.has(action) && channelActions.has(action)) continue;
            const ok = await writeAuditLog(strapi, {
              actor: {
                actorUserId: null,
                actorEmail: 'strict-smoke@system.local',
                actorRole: 'system',
              },
              requestId: strictRequestId,
              action,
              targetType: 'strict-audit-smoke',
              targetRef: action,
              payload: {
                source: 'audit_log_smoke_strict_sync',
                reason: 'missing_db_or_channel',
              },
            });
            if (ok) {
              seededForSync += 1;
              pass(`strict sync seed action emitted: ${action}`);
            } else {
              fail(`strict sync seed action failed: ${action}`);
            }
          }

          if (seededForSync > 0) {
            recent = await strapi.entityService.findMany(AUDIT_UID, {
              publicationState: 'preview',
              fields: ['event_id', 'action', 'createdAt'],
              sort: ['createdAt:desc'],
              limit: 2000,
            });
            actionSet = collectActionSet(recent);
            channelActions = collectAuditChannelActionSet(auditChannelFile) || new Set();
          }
        }

        for (const action of REQUIRED_ACTIONS) {
          if (actionSet.has(action)) {
            pass(`required action present: ${action}`);
          } else {
            fail(`required action missing: ${action}`);
          }
        }

        for (const action of REQUIRED_ACTIONS) {
          if (channelActions.has(action)) {
            pass(`required audit channel action present: ${action}`);
          } else {
            fail(`required audit channel action missing: ${action}`);
          }
        }
      }
    }
  } finally {
    await strapi.destroy();
  }

  console.log('==============================================================');
  if (failCount > 0) {
    console.log(`AUDIT LOG SMOKE: FAIL (${failCount} fail, ${passCount} pass)`);
    console.log('==============================================================');
    process.exit(1);
  }

  console.log(`AUDIT LOG SMOKE: PASS (${passCount} pass)`);
  console.log('==============================================================');
};

run().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
