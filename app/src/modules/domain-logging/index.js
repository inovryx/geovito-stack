'use strict';

const fs = require('fs/promises');
const path = require('path');
const { DOMAINS, LEVELS, DEFAULT_DOMAIN, DEFAULT_LEVEL } = require('./constants');
const { redactObject, redactText } = require('./redact');

const DOMAIN_SET = new Set(DOMAINS);
const LEVEL_SET = new Set(LEVELS);
const LEVEL_ORDER = Object.freeze({
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
});

const resolveLogRoot = () => {
  const configured = process.env.DOMAIN_LOG_ROOT;
  if (configured && configured.trim()) {
    return path.resolve(configured.trim());
  }
  return path.resolve(process.cwd(), '..', 'logs');
};

const normalizeDomain = (domain) => {
  const value = String(domain || '').trim().toLowerCase();
  return DOMAIN_SET.has(value) ? value : DEFAULT_DOMAIN;
};

const normalizeLevel = (level) => {
  const value = String(level || DEFAULT_LEVEL).trim().toUpperCase();
  return LEVEL_SET.has(value) ? value : DEFAULT_LEVEL;
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
});

const appendDomainLogs = async (record) => {
  const domainDir = await ensureDomainDir(record.domain);
  const humanPath = path.join(domainDir, `${record.domain}.log`);
  const jsonlPath = path.join(domainDir, `${record.domain}.jsonl`);

  await fs.appendFile(humanPath, `${formatHumanLine(record)}\n`, 'utf8');
  await fs.appendFile(jsonlPath, `${JSON.stringify(record)}\n`, 'utf8');
};

const ensureLogRuntime = async () => {
  const root = resolveLogRoot();
  await fs.mkdir(root, { recursive: true });
  await assertWritableDirectory(root);

  for (const domain of DOMAINS) {
    const domainDir = await ensureDomainDir(domain);
    await assertWritableDirectory(domainDir);
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

  return record;
};

module.exports = {
  log,
  ensureLogRuntime,
  shouldEmitLevel,
  resolveLogRoot,
};
