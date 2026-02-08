#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');

const KNOWN_DOMAINS = ['atlas', 'blog', 'ui', 'search', 'suggestions', 'ops', 'import', 'ai'];
const DEFAULT_SINCE = '24h';

const usage = () => {
  console.log('Usage: node tools/log_report.js [--since 24h] [--domain suggestions]');
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  let since = DEFAULT_SINCE;
  let domain = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--since') {
      since = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--domain') {
      domain = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
  }

  return { since, domain };
};

const parseSince = (raw) => {
  const value = String(raw || '').trim().toLowerCase();
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid --since value: ${raw}. Expected formats like 30m, 2h, 1d.`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier =
    unit === 's' ? 1000 : unit === 'm' ? 60 * 1000 : unit === 'h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  return amount * multiplier;
};

const parseJsonlFile = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
};

const parseHumanFile = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
};

const selectDomains = (requested) => {
  if (!requested) return KNOWN_DOMAINS;
  const domain = String(requested).trim().toLowerCase();
  if (!KNOWN_DOMAINS.includes(domain)) {
    throw new Error(`Unknown domain: ${requested}. Allowed: ${KNOWN_DOMAINS.join(', ')}`);
  }
  return [domain];
};

const toTimestamp = (input) => {
  const date = new Date(input);
  const value = Number(date.getTime());
  return Number.isFinite(value) ? value : null;
};

const buildLevelCounts = (entries) => {
  const counts = {
    total: entries.length,
    DEBUG: 0,
    INFO: 0,
    WARN: 0,
    ERROR: 0,
  };

  for (const entry of entries) {
    const level = String(entry.level || '').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(counts, level)) {
      counts[level] += 1;
    }
  }

  return counts;
};

const topErrorEvents = (entries) => {
  const counters = new Map();
  for (const entry of entries) {
    if (String(entry.level || '').toUpperCase() !== 'ERROR') continue;
    const event = String(entry.event || 'event.unknown');
    counters.set(event, (counters.get(event) || 0) + 1);
  }

  return [...counters.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5);
};

const parseHumanLineTs = (line) => {
  const firstChunk = String(line || '').split(' ')[0];
  return toTimestamp(firstChunk);
};

const lastHumanErrors = (lines, sinceTs, limit = 50) => {
  const filtered = lines.filter((line) => {
    if (!line.includes(' ERROR ')) return false;
    const ts = parseHumanLineTs(line);
    return ts !== null && ts >= sinceTs;
  });
  return filtered.slice(-limit);
};

const main = async () => {
  const args = parseArgs();
  const sinceMs = parseSince(args.since || DEFAULT_SINCE);
  const sinceTs = Date.now() - sinceMs;
  const domains = selectDomains(args.domain);

  const rootDir = path.resolve(__dirname, '..');
  const logsRoot = path.join(rootDir, 'logs');

  console.log(`Log report since ${args.since || DEFAULT_SINCE} (from ${new Date(sinceTs).toISOString()})`);
  console.log('');

  for (const domain of domains) {
    const domainDir = path.join(logsRoot, domain);
    const jsonlPath = path.join(domainDir, `${domain}.jsonl`);
    const humanPath = path.join(domainDir, `${domain}.log`);

    const jsonEntries = await parseJsonlFile(jsonlPath);
    const filteredEntries = jsonEntries.filter((entry) => {
      const ts = toTimestamp(entry.ts);
      return ts !== null && ts >= sinceTs;
    });

    const counts = buildLevelCounts(filteredEntries);
    const topEvents = topErrorEvents(filteredEntries);
    const humanLines = await parseHumanFile(humanPath);
    const recentErrors = lastHumanErrors(humanLines, sinceTs, 50);

    console.log(`[${domain}] total=${counts.total} DEBUG=${counts.DEBUG} INFO=${counts.INFO} WARN=${counts.WARN} ERROR=${counts.ERROR}`);

    if (topEvents.length === 0) {
      console.log('  top-error-events: none');
    } else {
      console.log('  top-error-events:');
      for (const [event, count] of topEvents) {
        console.log(`    - ${event}: ${count}`);
      }
    }

    console.log('  last-human-errors:');
    if (recentErrors.length === 0) {
      console.log('    - none');
    } else {
      for (const line of recentErrors) {
        console.log(`    - ${line}`);
      }
    }

    console.log('');
  }
};

main().catch((error) => {
  console.error(`log_report failed: ${error.message || String(error)}`);
  process.exit(1);
});
