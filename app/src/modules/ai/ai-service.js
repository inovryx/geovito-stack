'use strict';

const fs = require('fs/promises');
const path = require('path');
const Ajv = require('ajv');
const { errors } = require('@strapi/utils');
const diagnosticsSchema = require('./contracts/ai-diagnostics-output.v1.schema.json');
const draftSchema = require('./contracts/ai-draft-output.v1.schema.json');
const { getAiFlags } = require('./feature-flags');
const { redactObject, redactText } = require('./redaction');
const { hashOutput, writeAiAudit } = require('./ai-audit');
const { log, resolveLogRoot } = require('../domain-logging');

const AI_LOG_DOMAINS = Object.freeze(['atlas', 'blog', 'ui', 'search', 'suggestions', 'ops', 'import', 'ai']);
const DEFAULT_DIAGNOSTIC_SINCE = '24h';
const DEFAULT_DIAGNOSTIC_LINES = 200;
const MAX_DIAGNOSTIC_LINES = 500;

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

const validateDiagnosticsOutput = ajv.compile(diagnosticsSchema);
const validateDraftOutput = ajv.compile(draftSchema);

const unwrapInput = (payload) => {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    payload.data &&
    typeof payload.data === 'object'
  ) {
    return payload.data;
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload;
  }
  return {};
};

const clampInteger = (value, minValue, maxValue, fallbackValue) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallbackValue;
  return Math.max(minValue, Math.min(maxValue, Math.trunc(number)));
};

const parseSinceToMs = (value) => {
  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new errors.ValidationError('Invalid since value. Use formats like 30m, 2h, or 1d.');
  }

  const amount = Number(match[1]);
  const unit = match[2];

  const multiplier =
    unit === 's' ? 1000 : unit === 'm' ? 60 * 1000 : unit === 'h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  return amount * multiplier;
};

const readJsonlWithLineRefs = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const results = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const parsed = JSON.parse(trimmed);
        results.push({
          lineRef: `${path.basename(filePath)}#L${index + 1}`,
          entry: parsed,
        });
      } catch {
        // Ignore malformed lines to keep reporting resilient.
      }
    });

    return results;
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
};

const toTimestamp = (input) => {
  const parsed = new Date(input);
  const value = Number(parsed.getTime());
  return Number.isFinite(value) ? value : null;
};

const collectLogExcerpts = async ({ domains, sinceTs, maxLines }) => {
  const logRoot = resolveLogRoot();
  const collected = [];

  for (const domain of domains) {
    const filePath = path.join(logRoot, domain, `${domain}.jsonl`);
    const entries = await readJsonlWithLineRefs(filePath);

    for (const item of entries) {
      const tsValue = toTimestamp(item.entry?.ts);
      if (tsValue === null || tsValue < sinceTs) continue;

      collected.push({
        ts: item.entry.ts,
        domain,
        level: String(item.entry.level || '').toUpperCase(),
        event: String(item.entry.event || 'event.unknown'),
        request_id: item.entry.request_id || null,
        message: redactText(String(item.entry.message || '')),
        line_ref: `${domain}/${item.lineRef}`,
      });
    }
  }

  collected.sort((left, right) => {
    const leftTs = toTimestamp(left.ts) || 0;
    const rightTs = toTimestamp(right.ts) || 0;
    return rightTs - leftTs;
  });

  return collected.slice(0, maxLines);
};

const loadSystemRuntimeDoc = async () => {
  const candidates = [
    path.resolve(process.cwd(), '..', 'systemcalisma.txt'),
    path.resolve(process.cwd(), '..', '..', 'systemcalisma.txt'),
    '/home/ali/systemcalisma.txt',
  ];

  for (const candidate of candidates) {
    try {
      const content = await fs.readFile(candidate, 'utf8');
      return {
        found: true,
        source: candidate,
        excerpt: redactText(content).slice(0, 3000),
      };
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return {
    found: false,
    source: null,
    excerpt: '',
  };
};

const summarizeTopEvents = (entries, level) => {
  const counts = new Map();

  for (const entry of entries) {
    if (entry.level !== level) continue;
    counts.set(entry.event, (counts.get(entry.event) || 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 4);
};

const getRiskLevel = (errorCount, warnCount) => {
  if (errorCount >= 20) return 'critical';
  if (errorCount >= 5) return 'high';
  if (errorCount > 0 || warnCount >= 10) return 'medium';
  return 'low';
};

const buildDiagnosticsOutput = ({ excerpts, question, runtimeDoc }) => {
  const errorEntries = excerpts.filter((entry) => entry.level === 'ERROR');
  const warnEntries = excerpts.filter((entry) => entry.level === 'WARN');
  const topErrors = summarizeTopEvents(excerpts, 'ERROR');

  const rootCauses =
    topErrors.length > 0
      ? topErrors.map(([event, count]) => `Likely issue cluster: ${event} (${count} occurrences)`)
      : ['No ERROR cluster found in selected window.'];

  const evidenceSource = errorEntries.length > 0 ? errorEntries : warnEntries;
  const evidence = evidenceSource.slice(0, 10).map((entry) => ({
    domain: entry.domain,
    event: entry.event,
    request_id: entry.request_id || null,
    line_ref: entry.line_ref,
    message: entry.message.slice(0, 900),
    ts: entry.ts,
  }));

  const steps = [
    'Run `bash tools/log_report.sh --since 2h` and confirm recurring ERROR event codes.',
    'Trace request_id values from evidence across Strapi API and operator timeline.',
    'Apply smallest reversible fix, then rerun health checks before broader rollout.',
  ];

  if (question) {
    steps.push(`Operator focus: ${question.slice(0, 180)}`);
  }

  if (runtimeDoc.found) {
    steps.push('Cross-check systemcalisma runbook notes before escalating infrastructure changes.');
  }

  const riskLevel = getRiskLevel(errorEntries.length, warnEntries.length);
  const signalWeight = errorEntries.length * 2 + warnEntries.length;
  const confidence = Number(Math.max(0.2, Math.min(0.95, signalWeight / 20)).toFixed(2));

  const rollback = [
    'Disable only the recently changed feature flag or route.',
    'Revert last deployment unit touching affected domain.',
    'Verify `/admin` health and rerun suggestion + frontend smoke checks.',
  ];

  return {
    confidence,
    root_causes: rootCauses,
    evidence,
    steps,
    risk_level: riskLevel,
    rollback,
  };
};

const pickPlaceTranslation = (place, language) => {
  const translations = Array.isArray(place?.translations) ? place.translations : [];
  if (translations.length === 0) return null;

  return (
    translations.find((item) => item.language === language && item.status === 'complete') ||
    translations.find((item) => item.status === 'complete') ||
    translations.find((item) => item.language === language) ||
    translations[0]
  );
};

const loadPlaceSummary = async (strapi, targetPlaceId, language) => {
  if (!targetPlaceId) return null;

  const entries = await strapi.entityService.findMany('api::atlas-place.atlas-place', {
    publicationState: 'preview',
    filters: { place_id: targetPlaceId },
    populate: ['translations'],
    limit: 1,
  });

  const place = entries[0];
  if (!place) return null;

  const translation = pickPlaceTranslation(place, language);

  return redactObject({
    place_id: place.place_id,
    place_type: place.place_type,
    country_code: place.country_code,
    title: translation?.title || place.place_id,
    excerpt: translation?.excerpt || '',
  });
};

const buildDraftOutput = ({ mode, language, notes, placeSummary }) => {
  const subject = placeSummary?.title || (mode === 'atlas' ? 'Atlas Entry' : 'Blog Topic');
  const title = `${subject} - ${mode === 'atlas' ? 'Atlas Draft' : 'Blog Draft'} (${language})`;

  const outline =
    mode === 'atlas'
      ? ['Overview', 'Verified facts', 'Current gaps', 'Editorial next actions']
      : ['Opening context', 'Core narrative', 'Practical details', 'Conclusion and CTA'];

  const bodySections = [
    `# ${title}`,
    `_Language: ${language}_`,
    placeSummary
      ? `Target place reference: \`${placeSummary.place_id}\` (${placeSummary.place_type}, ${placeSummary.country_code || 'N/A'})`
      : 'Target place reference: none',
    placeSummary?.excerpt ? `Known summary: ${placeSummary.excerpt}` : 'Known summary: not provided',
    `## Draft`,
    `This is an AI-assisted ${mode} draft prepared for editorial review only.`,
    notes ? `Operator notes: ${notes}` : 'Operator notes: none',
    '## Editorial checks',
    '- Verify factual accuracy against canonical Atlas data.',
    '- Confirm language-state workflow before publication.',
    '- Ensure SEO metadata is reviewed manually.',
  ];

  const bodyMarkdown = bodySections.join('\n\n');

  return {
    title: title.slice(0, 180),
    outline,
    body_markdown: bodyMarkdown.slice(0, 20000),
    seo: {
      meta_title: title.slice(0, 180),
      meta_description: `AI draft for ${mode} mode in ${language}. Requires editorial review.`.slice(0, 320),
    },
    internal_links: placeSummary?.place_id ? [placeSummary.place_id] : [],
    disclaimer: 'AI-generated draft. Requires editorial review before publication.',
  };
};

const validateContract = (validator, output, contractName) => {
  if (validator(output)) return;
  const details = (validator.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ');
  throw new errors.ValidationError(`${contractName} validation failed: ${details}`);
};

const assertDiagnosticsEnabled = () => {
  const flags = getAiFlags();
  if (!flags.enabled || !flags.diagnosticsEnabled) {
    throw new errors.ForbiddenError('AI diagnostics is disabled by feature flags');
  }
};

const assertDraftEnabled = () => {
  const flags = getAiFlags();
  if (!flags.enabled || !flags.draftEnabled) {
    throw new errors.ForbiddenError('AI draft is disabled by feature flags');
  }
  return flags;
};

const runDiagnostics = async ({ input, requestId, actor }) => {
  const payload = unwrapInput(input);
  const normalizedDomain = payload.domain ? String(payload.domain).trim().toLowerCase() : null;
  const question = redactText(String(payload.question || '')).trim();

  const domains = normalizedDomain ? [normalizedDomain] : [...AI_LOG_DOMAINS];
  if (!domains.every((domain) => AI_LOG_DOMAINS.includes(domain))) {
    throw new errors.ValidationError(`domain must be one of: ${AI_LOG_DOMAINS.join(', ')}`);
  }

  const sinceRaw = payload.since ? String(payload.since) : DEFAULT_DIAGNOSTIC_SINCE;
  const sinceMs = parseSinceToMs(sinceRaw);
  const sinceTs = Date.now() - sinceMs;
  const maxLines = clampInteger(payload.max_lines, 10, MAX_DIAGNOSTIC_LINES, DEFAULT_DIAGNOSTIC_LINES);

  assertDiagnosticsEnabled();

  try {
    const excerpts = await collectLogExcerpts({ domains, sinceTs, maxLines });
    const runtimeDoc = await loadSystemRuntimeDoc();
    const output = buildDiagnosticsOutput({ excerpts, question, runtimeDoc });

    validateContract(validateDiagnosticsOutput, output, 'ai-diagnostics-output.v1');

    await writeAiAudit({
      request_id: requestId,
      actor,
      action: 'diagnostics',
      inputs_summary: {
        domain: normalizedDomain || 'all',
        since: sinceRaw,
        max_lines: maxLines,
        question_provided: Boolean(question),
        log_entries_used: excerpts.length,
        systemcalisma_found: runtimeDoc.found,
      },
      source_domains: domains,
      output_hash: hashOutput(output),
      output_summary: `risk=${output.risk_level}; evidence=${output.evidence.length}`,
      status: 'success',
    });

    await log(
      'ai',
      'INFO',
      'ai.diagnostics.generated',
      'AI diagnostics generated',
      {
        risk_level: output.risk_level,
        evidence_count: output.evidence.length,
      },
      {
        request_id: requestId,
        actor,
      }
    );

    return output;
  } catch (error) {
    await writeAiAudit({
      request_id: requestId,
      actor,
      action: 'diagnostics',
      inputs_summary: {
        domain: normalizedDomain || 'all',
        since: sinceRaw,
        max_lines: maxLines,
      },
      source_domains: domains,
      output_hash: null,
      output_summary: error?.message || String(error),
      status: 'fail',
    });
    throw error;
  }
};

const runDraft = async ({ strapi, input, requestId, actor }) => {
  const payload = unwrapInput(input);
  const mode = String(payload.mode || '').trim().toLowerCase();
  const targetPlaceId = String(payload.target_place_id || '').trim();
  const language = String(payload.language || '').trim().toLowerCase();
  const notes = redactText(String(payload.notes || '')).trim().slice(0, 2000);

  if (!['atlas', 'blog'].includes(mode)) {
    throw new errors.ValidationError('mode must be atlas or blog');
  }

  const flags = assertDraftEnabled();
  if (!flags.authorLanguages.includes(language)) {
    throw new errors.ValidationError(`language must be one of: ${flags.authorLanguages.join(', ')}`);
  }

  try {
    const placeSummary = targetPlaceId ? await loadPlaceSummary(strapi, targetPlaceId, language) : null;
    const output = buildDraftOutput({ mode, language, notes, placeSummary });

    validateContract(validateDraftOutput, output, 'ai-draft-output.v1');

    await writeAiAudit({
      request_id: requestId,
      actor,
      action: 'draft',
      inputs_summary: {
        mode,
        language,
        target_place_id: targetPlaceId || null,
        notes_length: notes.length,
        place_context_loaded: Boolean(placeSummary),
      },
      source_domains: placeSummary ? ['atlas'] : [],
      output_hash: hashOutput(output),
      output_summary: `mode=${mode}; links=${output.internal_links.length}`,
      status: 'success',
    });

    await log(
      'ai',
      'INFO',
      'ai.draft.generated',
      'AI draft generated',
      {
        mode,
        language,
        has_place_context: Boolean(placeSummary),
      },
      {
        request_id: requestId,
        actor,
        entity_ref: targetPlaceId || null,
      }
    );

    return output;
  } catch (error) {
    await writeAiAudit({
      request_id: requestId,
      actor,
      action: 'draft',
      inputs_summary: {
        mode,
        language,
        target_place_id: targetPlaceId || null,
      },
      source_domains: [],
      output_hash: null,
      output_summary: error?.message || String(error),
      status: 'fail',
    });
    throw error;
  }
};

module.exports = {
  runDiagnostics,
  runDraft,
};
