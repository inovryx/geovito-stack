'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { log, resolveLogRoot } = require('../domain-logging');
const { redactObject, redactText } = require('./redaction');

const resolveAuditDir = () => path.join(resolveLogRoot(), 'ai');

const toAuditLine = (entry) =>
  [
    entry.ts,
    entry.status === 'success' ? 'INFO' : 'ERROR',
    '[ai-audit]',
    `action=${entry.action}`,
    `request_id=${entry.request_id || '-'}`,
    `actor=${entry.actor || '-'}`,
    `status=${entry.status}`,
    `output_hash=${entry.output_hash || '-'}`,
    entry.output_summary || '',
  ]
    .filter(Boolean)
    .join(' ');

const buildAuditEntry = (input) => ({
  ts: new Date().toISOString(),
  request_id: input.request_id || null,
  actor: input.actor || 'system',
  action: input.action,
  inputs_summary: redactObject(input.inputs_summary || {}),
  source_domains: Array.isArray(input.source_domains) ? input.source_domains : [],
  output_hash: input.output_hash || null,
  output_summary: redactText(String(input.output_summary || '')).slice(0, 500),
  status: input.status === 'success' ? 'success' : 'fail',
});

const hashOutput = (output) =>
  crypto.createHash('sha256').update(JSON.stringify(redactObject(output || {}))).digest('hex');

const writeAiAudit = async (entryInput) => {
  const entry = buildAuditEntry(entryInput);
  const auditDir = resolveAuditDir();

  await fs.mkdir(auditDir, { recursive: true });
  const humanPath = path.join(auditDir, 'ai-audit.log');
  const jsonlPath = path.join(auditDir, 'ai-audit.jsonl');

  await fs.appendFile(humanPath, `${toAuditLine(entry)}\n`, 'utf8');
  await fs.appendFile(jsonlPath, `${JSON.stringify(entry)}\n`, 'utf8');

  await log(
    'ai',
    entry.status === 'success' ? 'INFO' : 'ERROR',
    'ai.audit.recorded',
    `AI ${entry.action} ${entry.status}`,
    {
      source_domains: entry.source_domains,
      output_hash: entry.output_hash,
      output_summary: entry.output_summary,
    },
    {
      request_id: entry.request_id,
      actor: entry.actor,
    }
  );

  return entry;
};

module.exports = {
  hashOutput,
  writeAiAudit,
};
