#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');

const DEFAULT_ATLAS_INPUT = path.join(process.cwd(), 'artifacts/search/atlas-documents.json');
const DEFAULT_BLOG_INPUT = path.join(process.cwd(), 'artifacts/search/blog-documents.json');
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'artifacts/internal-links');

const normalizeToken = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const config = {
    atlasPath: DEFAULT_ATLAS_INPUT,
    blogPath: DEFAULT_BLOG_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
    minConfidence: 0.55,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--atlas' && args[index + 1]) {
      config.atlasPath = path.resolve(args[++index]);
      continue;
    }
    if (arg === '--blog' && args[index + 1]) {
      config.blogPath = path.resolve(args[++index]);
      continue;
    }
    if (arg === '--out' && args[index + 1]) {
      config.outputDir = path.resolve(args[++index]);
      continue;
    }
    if (arg === '--min-confidence' && args[index + 1]) {
      const parsed = Number(args[++index]);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1) {
        config.minConfidence = parsed;
      }
      continue;
    }
  }

  return config;
};

const readJson = async (filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const resolveAtlasDocuments = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.documents)) return payload.documents;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const resolveBlogDocuments = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.documents)) return payload.documents;
  if (Array.isArray(payload?.posts)) return payload.posts;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const buildAtlasCandidates = (atlasDocuments) => {
  const candidates = [];

  for (const entry of atlasDocuments) {
    const placeId = String(entry.place_id || entry.document_id || '').trim();
    const slug = String(entry.slug || '').trim();
    const language = String(entry.language || 'en').trim().toLowerCase();
    const title = String(entry.title || '').trim();
    if (!placeId || !slug || !title) continue;

    const aliases = asArray(entry.aliases)
      .map((alias) => String(alias || '').trim())
      .filter(Boolean);

    const names = Array.from(new Set([title, ...aliases])).filter((item) => item.length >= 3);
    if (names.length === 0) continue;

    candidates.push({
      place_id: placeId,
      slug,
      language,
      names,
      normalized_names: names.map(normalizeToken).filter(Boolean),
    });
  }

  return candidates;
};

const buildBlogRecords = (blogDocuments) => {
  return blogDocuments
    .map((entry, index) => {
      const sourceId =
        String(entry.post_id || entry.document_id || entry.slug || '').trim() ||
        `blog-doc-${String(index + 1).padStart(3, '0')}`;
      const title = String(entry.title || '').trim();
      const excerpt = String(entry.excerpt || entry.summary || '').trim();
      const body = String(entry.body || entry.body_markdown || entry.content || '').trim();
      const language = String(entry.language || 'en').trim().toLowerCase();

      const combined = normalizeToken([title, excerpt, body].filter(Boolean).join(' '));
      if (!combined) return null;

      return {
        source_doc: sourceId,
        language,
        title,
        raw_text: [title, excerpt, body].filter(Boolean).join('\n\n'),
        normalized_text: combined,
      };
    })
    .filter(Boolean);
};

const computeSuggestionConfidence = ({ titleHit, count, mentionLength }) => {
  let score = 0.45;
  if (titleHit) score += 0.2;
  if (count >= 2) score += 0.15;
  if (mentionLength >= 10) score += 0.1;
  return Math.max(0, Math.min(1, score));
};

const suggestLinks = (candidates, blogRecords, minConfidence) => {
  const suggestions = [];

  for (const blog of blogRecords) {
    const blogTitleNormalized = normalizeToken(blog.title);

    for (const candidate of candidates) {
      for (let idx = 0; idx < candidate.names.length; idx += 1) {
        const mention = candidate.names[idx];
        const normalizedMention = candidate.normalized_names[idx] || normalizeToken(mention);
        if (!normalizedMention || normalizedMention.length < 3) continue;

        const regex = new RegExp(`\\b${escapeRegex(normalizedMention)}\\b`, 'g');
        const matches = blog.normalized_text.match(regex) || [];
        if (matches.length === 0) continue;

        const titleHit = Boolean(blogTitleNormalized && blogTitleNormalized.match(regex));
        const confidence = computeSuggestionConfidence({
          titleHit,
          count: matches.length,
          mentionLength: normalizedMention.length,
        });

        if (confidence < minConfidence) continue;

        suggestions.push({
          source_doc: blog.source_doc,
          source_language: blog.language,
          mention,
          target_place_id: candidate.place_id,
          target_slug: candidate.slug,
          target_language: candidate.language,
          confidence: Number(confidence.toFixed(2)),
          evidence_count: matches.length,
          title_hit: titleHit,
        });
      }
    }
  }

  const unique = new Map();
  for (const suggestion of suggestions) {
    const key = `${suggestion.source_doc}|${suggestion.target_place_id}|${normalizeToken(suggestion.mention)}`;
    const existing = unique.get(key);
    if (!existing || suggestion.confidence > existing.confidence) {
      unique.set(key, suggestion);
    }
  }

  return Array.from(unique.values()).sort((left, right) => {
    if (right.confidence !== left.confidence) return right.confidence - left.confidence;
    return left.source_doc.localeCompare(right.source_doc);
  });
};

const writeReports = async (outputDir, suggestions) => {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'suggested-internal-links.json');
  const tsvPath = path.join(outputDir, 'suggested-internal-links.tsv');

  const payload = {
    generated_at: new Date().toISOString(),
    count: suggestions.length,
    suggestions,
  };

  const tsvHeader = [
    'source_doc',
    'source_language',
    'mention',
    'target_place_id',
    'target_slug',
    'target_language',
    'confidence',
    'evidence_count',
    'title_hit',
  ];

  const tsvLines = [
    tsvHeader.join('\t'),
    ...suggestions.map((entry) =>
      [
        entry.source_doc,
        entry.source_language,
        entry.mention,
        entry.target_place_id,
        entry.target_slug,
        entry.target_language,
        String(entry.confidence),
        String(entry.evidence_count),
        entry.title_hit ? 'true' : 'false',
      ]
        .map((value) => String(value || '').replace(/\t/g, ' '))
        .join('\t')
    ),
  ];

  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.writeFile(tsvPath, `${tsvLines.join('\n')}\n`, 'utf8');

  return { jsonPath, tsvPath };
};

const main = async () => {
  const config = parseArgs();

  const [atlasPayload, blogPayload] = await Promise.all([readJson(config.atlasPath), readJson(config.blogPath)]);
  const atlasDocuments = resolveAtlasDocuments(atlasPayload);
  const blogDocuments = resolveBlogDocuments(blogPayload);

  const candidates = buildAtlasCandidates(atlasDocuments);
  const blogRecords = buildBlogRecords(blogDocuments);
  const suggestions = suggestLinks(candidates, blogRecords, config.minConfidence);
  const reportPaths = await writeReports(config.outputDir, suggestions);

  console.log(
    JSON.stringify(
      {
        ok: true,
        atlas_input: config.atlasPath,
        blog_input: config.blogPath,
        output_dir: config.outputDir,
        outputs: reportPaths,
        counts: {
          atlas_candidates: candidates.length,
          blog_records: blogRecords.length,
          suggestions: suggestions.length,
        },
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
