'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const {
  DOMAINS,
  LEVELS,
  CHANNELS,
  DEFAULT_DOMAIN,
  DEFAULT_LEVEL,
  DEFAULT_CHANNEL,
} = require('./constants');
const { redactObject, redactText } = require('./redact');

const DOMAIN_SET = new Set(DOMAINS);
const LEVEL_SET = new Set(LEVELS);
const CHANNEL_SET = new Set(CHANNELS);

const LEVEL_ORDER = Object.freeze({
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
});

const DOMAIN_CHANNEL_MAP = Object.freeze({
  atlas: 'app',
  blog: 'app',
  ui: 'app',
  search: 'app',
  suggestions: 'app',
  ops: 'app',
  import: 'app',
  ai: 'app',
});

const USER_REF_SALT = String(process.env.LOG_USER_REF_SALT || process.env.APP_KEYS || 'geovito-log');

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const LOG_CONTRACT_ENABLED = parseBool(process.env.LOG_CONTRACT_ENABLED, true);
const LOG_CONTRACT_STDOUT = parseBool(process.env.LOG_CONTRACT_STDOUT, true);
const LOG_CONTRACT_FILE_ENABLED = parseBool(process.env.LOG_CONTRACT_FILE_ENABLED, true);

const resolveLogRoot = () => {
  const configured = process.env.DOMAIN_LOG_ROOT;
  if (configured && configured.trim()) {
    return path.resolve(configured.trim());
  }
  return path.resolve(process.cwd(), '..', 'logs');
};

const resolveContractLogRoot = () => {
  const configured = process.env.LOG_CONTRACT_FILE_ROOT;
  if (configured && configured.trim()) {
    return path.resolve(configured.trim());
  }
  return path.join(resolveLogRoot(), 'channels');
};

const normalizeEnv = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'dev';
  if (normalized === 'production' || normalized === 'prod') return 'prod';
  if (normalized === 'staging' || normalized === 'stage') return 'staging';
  if (normalized === 'development' || normalized === 'dev') return 'dev';
  return normalized;
};

const normalizeDomain = (domain) => {
  const value = String(domain || '').trim().toLowerCase();
  return DOMAIN_SET.has(value) ? value : DEFAULT_DOMAIN;
};

const normalizeLevel = (level) => {
  const value = String(level || DEFAULT_LEVEL).trim().toUpperCase();
  return LEVEL_SET.has(value) ? value : DEFAULT_LEVEL;
};

const normalizeChannel = (channel) => {
  const value = String(channel || '').trim().toLowerCase();
  return CHANNEL_SET.has(value) ? value : DEFAULT_CHANNEL;
};

const getConfiguredLogLevel = () => normalizeLevel(process.env.LOG_LEVEL || DEFAULT_LEVEL);

const shouldEmitLevel = (level) => {
  const normalizedLevel = normalizeLevel(level);
  if (normalizedLevel === 'WARN' || normalizedLevel === 'ERROR') {
    return true;
  }

  const configuredLevel = getConfiguredLogLevel();
  return LEVEL_ORDER[normalizedLevel] >= LEVEL_ORDER[configuredLevel];
};

const normalizeText = (value, fallback = '') => {
  const text = redactText(String(value || fallback)).trim();
  return text.length > 0 ? text : fallback;
};

const ensureDomainDir = async (domain) => {
  const root = resolveLogRoot();
  const domainDir = path.join(root, domain);
  await fs.mkdir(domainDir, { recursive: true });
  return domainDir;
};

const ensureContractDir = async () => {
  const root = resolveContractLogRoot();
  await fs.mkdir(root, { recursive: true });
  return root;
};

const assertWritableDirectory = async (targetDir) => {
  const probeFile = path.join(targetDir, `.write-probe-${process.pid}-${Date.now()}`);
  await fs.writeFile(probeFile, 'ok\n', 'utf8');
  await fs.rm(probeFile, { force: true });
};

const formatHumanLine = (record) => {
  const base = [
    record.ts,
    record.level,
    `[${record.domain}]`,
    record.event,
    `request_id=${record.request_id || '-'}`,
    `actor=${record.actor || '-'}`,
    `entity_ref=${record.entity_ref || '-'}`,
  ].join(' ');

  return `${base} ${record.message} meta=${JSON.stringify(record.meta)}`;
};

const resolveChannelFromEvent = (domain, event, context = {}) => {
  if (context.channel) {
    return normalizeChannel(context.channel);
  }

  const eventKey = String(event || '').trim().toLowerCase();

  if (eventKey.startsWith('audit.') || eventKey.includes('gate.go_live_full.override')) {
    return 'audit';
  }

  if (eventKey.startsWith('release.') || eventKey.startsWith('deploy.') || eventKey.startsWith('gate.')) {
    return 'release';
  }

  if (eventKey.startsWith('dr.') || eventKey.startsWith('backup.') || eventKey.startsWith('restore.')) {
    return 'dr';
  }

  if (
    eventKey.startsWith('moderation.') ||
    eventKey.includes('.moderation.') ||
    eventKey.includes('content_report') ||
    eventKey.includes('account_request')
  ) {
    return 'moderation';
  }

  if (
    eventKey.startsWith('auth.') ||
    eventKey.startsWith('turnstile.') ||
    eventKey.startsWith('security.') ||
    eventKey.includes('rate_limited') ||
    eventKey.includes('unauthorized') ||
    eventKey.includes('forbidden')
  ) {
    return 'security';
  }

  return normalizeChannel(DOMAIN_CHANNEL_MAP[domain] || DEFAULT_CHANNEL);
};

const pseudonymize = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const digest = crypto.createHash('sha256').update(`${USER_REF_SALT}:${raw}`).digest('hex').slice(0, 16);
  return `u_${digest}`;
};

const resolveUserRef = (meta, context = {}) => {
  if (context.user_ref) {
    return pseudonymize(context.user_ref);
  }

  const candidates = [
    meta?.user_id,
    meta?.owner_user_id,
    meta?.actor_user_id,
    meta?.resolved_by,
    context?.actor,
  ];

  const found = candidates.find((candidate) => candidate !== null && candidate !== undefined && String(candidate).trim());
  return found ? pseudonymize(found) : null;
};

const createFallbackRequestId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return `gv-log-${crypto.randomUUID()}`;
  }
  return `gv-log-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
};

const resolveRequestId = (record, context = {}) => {
  const candidate = record?.request_id || context?.request_id || context?.run_id || null;
  const normalized = normalizeText(candidate, null);
  if (!normalized) return createFallbackRequestId();
  const lower = normalized.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === '-' || lower === 'none') {
    return createFallbackRequestId();
  }
  return normalized;
};

const buildRecord = (domain, level, event, message, meta = {}, context = {}) => ({
  ts: new Date().toISOString(),
  level: normalizeLevel(level),
  domain: normalizeDomain(domain),
  event: normalizeText(event, 'event.unknown'),
  request_id: context.request_id ? normalizeText(context.request_id, null) : null,
  actor: context.actor ? normalizeText(context.actor, null) : null,
  entity_ref: context.entity_ref ? normalizeText(context.entity_ref, null) : null,
  message: normalizeText(message, ''),
  meta: redactObject(meta || {}),
  context: redactObject(context || {}),
});

const buildContractRecord = (record) => {
  const meta = record.meta && typeof record.meta === 'object' ? record.meta : {};
  const ctx = record.context && typeof record.context === 'object' ? record.context : {};
  const level = String(record.level || DEFAULT_LEVEL).trim().toLowerCase();

  const latencyFromMeta = Number(meta.duration_ms ?? meta.latency_ms);
  const statusFromMeta = Number(meta.status ?? ctx.status ?? 0);

  return {
    ts: record.ts,
    env: normalizeEnv(process.env.APP_ENV || process.env.GEOVITO_ENV || process.env.NODE_ENV || 'dev'),
    channel: resolveChannelFromEvent(record.domain, record.event, ctx),
    level,
    msg: record.message,
    request_id: resolveRequestId(record, ctx),
    service: normalizeText(meta.service || ctx.service || 'strapi', 'strapi'),
    route_or_action: normalizeText(ctx.route_or_action || meta.path || record.event, record.event),
    status: Number.isFinite(statusFromMeta) && statusFromMeta > 0 ? statusFromMeta : null,
    latency_ms: Number.isFinite(latencyFromMeta) && latencyFromMeta >= 0 ? latencyFromMeta : null,
    user_ref: resolveUserRef(meta, ctx),
    meta,
  };
};

const appendDomainLogs = async (record) => {
  const domainDir = await ensureDomainDir(record.domain);
  const humanPath = path.join(domainDir, `${record.domain}.log`);
  const jsonlPath = path.join(domainDir, `${record.domain}.jsonl`);

  await fs.appendFile(humanPath, `${formatHumanLine(record)}\n`, 'utf8');
  await fs.appendFile(jsonlPath, `${JSON.stringify(record)}\n`, 'utf8');
};

const appendContractLogs = async (record) => {
  if (!LOG_CONTRACT_ENABLED) return;

  const contract = buildContractRecord(record);
  const line = `${JSON.stringify(contract)}\n`;

  if (LOG_CONTRACT_STDOUT) {
    process.stdout.write(line);
  }

  if (LOG_CONTRACT_FILE_ENABLED) {
    const contractDir = await ensureContractDir();
    const channelPath = path.join(contractDir, `${contract.channel}.jsonl`);
    const allPath = path.join(contractDir, 'all.jsonl');
    await fs.appendFile(channelPath, line, 'utf8');
    await fs.appendFile(allPath, line, 'utf8');
  }
};

const ensureLogRuntime = async () => {
  const root = resolveLogRoot();
  await fs.mkdir(root, { recursive: true });
  await assertWritableDirectory(root);

  for (const domain of DOMAINS) {
    const domainDir = await ensureDomainDir(domain);
    await assertWritableDirectory(domainDir);
  }

  if (LOG_CONTRACT_ENABLED && LOG_CONTRACT_FILE_ENABLED) {
    const contractDir = await ensureContractDir();
    await assertWritableDirectory(contractDir);
  }

  return root;
};

const log = async (domain, level, event, message, meta = {}, context = {}) => {
  const record = buildRecord(domain, level, event, message, meta, context);

  try {
    await appendDomainLogs(record);
  } catch (error) {
    const fallback = {
      ...record,
      event: 'logging.write_failed',
      level: 'ERROR',
      message: 'Failed to write domain log record',
      meta: redactObject({
        logging_error: error?.message || String(error),
        original_event: record.event,
      }),
    };

    try {
      await appendDomainLogs(fallback);
    } catch {
      // Last resort: avoid crashing the request lifecycle due to logging failure.
      console.error('[domain-logging] write_failed', fallback.meta);
    }
  }

  try {
    await appendContractLogs(record);
  } catch (error) {
    console.error('[contract-logging] write_failed', redactObject({
      message: error?.message || String(error),
      domain: record.domain,
      event: record.event,
    }));
  }

  return record;
};

module.exports = {
  log,
  ensureLogRuntime,
  shouldEmitLevel,
  resolveLogRoot,
  resolveContractLogRoot,
  buildContractRecord,
};
