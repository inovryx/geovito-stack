#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');

const DEFAULT_ATLAS_INPUT = path.join(process.cwd(), 'artifacts/search/atlas-documents.json');
const DEFAULT_BLOG_INPUT = path.join(process.cwd(), 'artifacts/search/blog-documents.json');
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'artifacts/internal-links');
const DEFAULT_MIN_CONFIDENCE = 0.5;

const STOPWORDS = new Set([
  've',
  'ile',
  'icin',
  'bir',
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'city',
  'country',
]);

const EXTRA_ALIAS_BY_PLACE_ID = {
  'country-us': ['abd', 'amerika birlesik devletleri', 'united states of america', 'usa', 'us'],
  'country-tr': ['turkiye', 'tuerkiye', 'turkey'],
  'country-de': ['almanya', 'deutschland', 'germany'],
  'city-us-new-york': ['new york', 'nyc', 'new york city'],
  'city-tr-istanbul': ['istanbul', 'istanbul city'],
};

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
    minConfidence: DEFAULT_MIN_CONFIDENCE,
    text: '',
    textFile: '',
    language: 'en',
    countryContext: '',
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

    if (arg === '--text' && args[index + 1]) {
      config.text = String(args[++index] || '');
      continue;
    }

    if (arg === '--text-file' && args[index + 1]) {
      config.textFile = path.resolve(args[++index]);
      continue;
    }

    if (arg === '--language' && args[index + 1]) {
      config.language = String(args[++index] || 'en').trim().toLowerCase();
      continue;
    }

    if (arg === '--country-context' && args[index + 1]) {
      config.countryContext = String(args[++index] || '').trim().toUpperCase();
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

const buildAtlasTargets = (atlasDocuments) => {
  const targets = [];

  for (const entry of atlasDocuments) {
    const placeId = String(entry.place_id || '').trim();
    const slug = String(entry.slug || '').trim();
    const title = String(entry.title || '').trim();
    const language = String(entry.language || 'en').trim().toLowerCase();
    const countryCode = String(entry.country_code || '').trim().toUpperCase();

    if (!placeId || !slug || !title) continue;
    if (language !== 'en') continue;

    const aliases = asArray(entry.aliases)
      .map((alias) => String(alias || '').trim())
      .filter(Boolean);

    const extraAliases = asArray(EXTRA_ALIAS_BY_PLACE_ID[placeId])
      .map((alias) => String(alias || '').trim())
      .filter(Boolean);

    const nameSet = new Set([title, slug.replace(/-/g, ' '), ...aliases, ...extraAliases]);

    const names = Array.from(nameSet)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3)
      .filter((item) => !STOPWORDS.has(normalizeToken(item)));

    if (names.length === 0) continue;

    const targetEnUrl = String(entry.url || '').trim() || `https://www.geovito.com/en/atlas/${slug}`;

    targets.push({
      place_id: placeId,
      slug,
      title,
      country_code: countryCode,
      target_en_url: targetEnUrl,
      names,
    });
  }

  return targets;
};

const computeConfidence = ({ mentionLength, count, countryContextMatch, titleMatch }) => {
  let score = 0.45;
  if (mentionLength >= 12) score += 0.2;
  else if (mentionLength >= 6) score += 0.12;
  else score += 0.08;

  if (count >= 2) score += 0.12;
  if (countryContextMatch) score += 0.1;
  if (titleMatch) score += 0.08;

  return Math.max(0, Math.min(0.99, score));
};

const findMatches = (textNormalized, phraseNormalized) => {
  if (!textNormalized || !phraseNormalized) return 0;
  const regex = new RegExp(`\\b${escapeRegex(phraseNormalized)}\\b`, 'g');
  const matches = textNormalized.match(regex) || [];
  return matches.length;
};

const suggestForText = ({ text, language, countryContext, targets, minConfidence, sourceDoc }) => {
  const normalizedText = normalizeToken(text);
  if (!normalizedText) return [];

  const suggestions = [];

  for (const target of targets) {
    for (const name of target.names) {
      const mentionNormalized = normalizeToken(name);
      if (!mentionNormalized || mentionNormalized.length < 3 || STOPWORDS.has(mentionNormalized)) continue;

      const count = findMatches(normalizedText, mentionNormalized);
      if (count === 0) continue;

      const countryContextMatch = Boolean(countryContext && target.country_code === countryContext);
      const titleMatch = mentionNormalized === normalizeToken(target.title);
      const confidence = computeConfidence({
        mentionLength: mentionNormalized.length,
        count,
        countryContextMatch,
        titleMatch,
      });

      if (confidence < minConfidence) continue;

      suggestions.push({
        source_doc: sourceDoc,
        source_language: language,
        anchor: name,
        target_place_id: target.place_id,
        target_slug: target.slug,
        target_en_url: target.target_en_url,
        confidence: Number(confidence.toFixed(2)),
        reason: [
          `match_count=${count}`,
          countryContextMatch ? 'country_context_match' : 'country_context_miss',
          titleMatch ? 'title_match' : 'alias_match',
        ].join(','),
      });
    }
  }

  const unique = new Map();
  for (const suggestion of suggestions) {
    const key = `${suggestion.source_doc}|${suggestion.target_place_id}|${normalizeToken(suggestion.anchor)}`;
    const existing = unique.get(key);
    if (!existing || suggestion.confidence > existing.confidence) {
      unique.set(key, suggestion);
    }
  }

  return Array.from(unique.values()).sort((left, right) => {
    if (right.confidence !== left.confidence) return right.confidence - left.confidence;
    return left.target_place_id.localeCompare(right.target_place_id);
  });
};

const buildBlogRecords = (blogDocuments) =>
  blogDocuments
    .map((entry, index) => {
      const sourceId =
        String(entry.post_id || entry.document_id || entry.slug || '').trim() ||
        `blog-doc-${String(index + 1).padStart(3, '0')}`;
      const title = String(entry.title || '').trim();
      const excerpt = String(entry.excerpt || entry.summary || '').trim();
      const body = String(entry.body || entry.body_markdown || entry.content || '').trim();
      const language = String(entry.language || 'en').trim().toLowerCase();

      const text = [title, excerpt, body].filter(Boolean).join('\n\n').trim();
      if (!text) return null;

      return {
        source_doc: sourceId,
        language,
        text,
      };
    })
    .filter(Boolean);

const writeJsonReport = async (outputPath, payload) => {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const writeTsvReport = async (outputPath, suggestions) => {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const headers = [
    'source_doc',
    'source_language',
    'anchor',
    'target_place_id',
    'target_slug',
    'target_en_url',
    'confidence',
    'reason',
  ];

  const lines = [
    headers.join('\t'),
    ...suggestions.map((entry) =>
      [
        entry.source_doc,
        entry.source_language,
        entry.anchor,
        entry.target_place_id,
        entry.target_slug,
        entry.target_en_url,
        String(entry.confidence),
        entry.reason,
      ]
        .map((value) => String(value || '').replace(/\t/g, ' '))
        .join('\t')
    ),
  ];

  await fs.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
};

const runSingleTextMode = async (config, targets) => {
  let inputText = String(config.text || '').trim();
  if (!inputText && config.textFile) {
    inputText = await fs.readFile(config.textFile, 'utf8');
  }

  const suggestions = suggestForText({
    text: inputText,
    language: config.language,
    countryContext: config.countryContext,
    targets,
    minConfidence: config.minConfidence,
    sourceDoc: 'input:text',
  });

  const payload = {
    generated_at: new Date().toISOString(),
    mode: 'single_text',
    input: {
      language: config.language,
      country_context: config.countryContext || null,
      text_length: inputText.length,
    },
    count: suggestions.length,
    suggestions,
  };

  const jsonPath = path.join(config.outputDir, 'suggested-internal-links.single.json');
  await writeJsonReport(jsonPath, payload);

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'single_text',
        output: jsonPath,
        count: suggestions.length,
      },
      null,
      2
    )
  );
};

const runBatchBlogMode = async (config, targets) => {
  const blogPayload = await readJson(config.blogPath);
  const blogDocuments = resolveBlogDocuments(blogPayload);
  const blogRecords = buildBlogRecords(blogDocuments);

  const suggestions = blogRecords.flatMap((record) =>
    suggestForText({
      text: record.text,
      language: record.language,
      countryContext: '',
      targets,
      minConfidence: config.minConfidence,
      sourceDoc: record.source_doc,
    })
  );

  const payload = {
    generated_at: new Date().toISOString(),
    mode: 'blog_batch',
    count: suggestions.length,
    suggestions,
  };

  const jsonPath = path.join(config.outputDir, 'suggested-internal-links.json');
  const tsvPath = path.join(config.outputDir, 'suggested-internal-links.tsv');

  await writeJsonReport(jsonPath, payload);
  await writeTsvReport(tsvPath, suggestions);

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'blog_batch',
        atlas_input: config.atlasPath,
        blog_input: config.blogPath,
        outputs: {
          json: jsonPath,
          tsv: tsvPath,
        },
        counts: {
          atlas_targets: targets.length,
          blog_records: blogRecords.length,
          suggestions: suggestions.length,
        },
      },
      null,
      2
    )
  );
};

const main = async () => {
  const config = parseArgs();
  const atlasPayload = await readJson(config.atlasPath);
  const atlasDocuments = resolveAtlasDocuments(atlasPayload);
  const targets = buildAtlasTargets(atlasDocuments);

  if (config.text || config.textFile) {
    await runSingleTextMode(config, targets);
    return;
  }

  await runBatchBlogMode(config, targets);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
