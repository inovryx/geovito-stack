'use strict';

const fs = require('fs/promises');
const path = require('path');
const { createStrapi } = require('@strapi/core');

const SUPPORTED_LANGUAGES = ['en', 'de', 'es', 'ru', 'zh-cn'];
const BUNDLE_VERSION = 'translation-bundle.v1';

const SAFE_TRANSLATION_FIELDS = [
  'title',
  'slug',
  'excerpt',
  'body',
  'status',
  'last_reviewed_at',
  'canonical_path',
  'runtime_translation',
  'indexable',
  'seo',
];

const SAFE_COUNTRY_PROFILE_FIELDS = [
  'enabled_levels',
  'parent_rules',
  'label_mapping',
  'city_like_levels',
  'region_auto_assign',
  'notes',
];

const APP_DIR = path.resolve(__dirname, '..');
let strapiInstance = null;

const isTrue = (value) => String(value || '').trim().toLowerCase() === 'true';

const asEntity = (entry) => {
  if (!entry) return null;
  if (entry.attributes) {
    return {
      id: entry.id,
      ...entry.attributes,
    };
  }
  return entry;
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const createAppInstance = async () => {
  const app = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });

  await app.load();
  return app;
};

const listAll = async (uid, options = {}) => {
  const items = [];
  const pageSize = 200;
  let start = 0;

  for (;;) {
    const batch = await strapiInstance.entityService.findMany(uid, {
      publicationState: 'preview',
      ...options,
      start,
      limit: pageSize,
    });

    const normalizedBatch = (Array.isArray(batch) ? batch : [batch]).filter(Boolean).map(asEntity);
    if (normalizedBatch.length === 0) {
      break;
    }

    items.push(...normalizedBatch);
    if (normalizedBatch.length < pageSize) {
      break;
    }

    start += pageSize;
  }

  return items;
};

const pickTranslation = (translations, language) => {
  const list = Array.isArray(translations) ? translations : [];
  const found = list.find((entry) => entry?.language === language);
  if (!found) {
    return {
      language,
      status: 'missing',
      runtime_translation: false,
      indexable: false,
    };
  }
  return clone(found);
};

const mergeTranslation = (translations, language, patch) => {
  const list = Array.isArray(translations) ? clone(translations) : [];
  const targetLanguage = String(language || '').trim().toLowerCase();
  if (!SUPPORTED_LANGUAGES.includes(targetLanguage)) {
    throw new Error(`Unsupported translation language: ${targetLanguage}`);
  }

  const patchRecord = patch && typeof patch === 'object' ? patch : {};
  const index = list.findIndex((entry) => entry?.language === targetLanguage);
  const base =
    index >= 0
      ? { ...list[index] }
      : {
          language: targetLanguage,
          status: 'missing',
          runtime_translation: false,
          indexable: false,
        };

  const next = { ...base };

  for (const field of SAFE_TRANSLATION_FIELDS) {
    if (!(field in patchRecord)) continue;
    if (field === 'seo' && patchRecord[field] !== null && typeof patchRecord[field] !== 'object') {
      continue;
    }
    next[field] = patchRecord[field];
  }

  next.language = targetLanguage;

  if (next.status !== 'complete' || next.runtime_translation) {
    next.indexable = false;
  }

  if (index >= 0) {
    list[index] = next;
  } else {
    list.push(next);
  }

  return list;
};

const ensureDir = async (directory) => {
  await fs.mkdir(directory, { recursive: true });
};

const writeJson = async (filePath, payload) => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const readJson = async (filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
};

const exportBundles = async (outputDir) => {
  const [uiPages, countryProfiles, regionGroups, atlasPlaces] = await Promise.all([
    listAll('api::ui-page.ui-page', { populate: ['translations'] }),
    listAll('api::country-profile.country-profile'),
    listAll('api::region-group.region-group', { populate: ['translations'] }),
    listAll('api::atlas-place.atlas-place', { populate: ['translations'] }),
  ]);

  const generatedAt = new Date().toISOString();
  const manifest = {
    version: BUNDLE_VERSION,
    generated_at: generatedAt,
    locales: SUPPORTED_LANGUAGES,
    files: {},
  };

  for (const language of SUPPORTED_LANGUAGES) {
    const payload = {
      version: BUNDLE_VERSION,
      locale: language,
      generated_at: generatedAt,
      content: {
        ui_pages: uiPages.map((entry) => ({
          page_key: entry.page_key,
          canonical_language: entry.canonical_language,
          mock: Boolean(entry.mock),
          translation: pickTranslation(entry.translations, language),
        })),
        country_profiles: countryProfiles.map((entry) => ({
          country_code: entry.country_code,
          enabled_levels: entry.enabled_levels || [],
          parent_rules: entry.parent_rules || {},
          label_mapping: entry.label_mapping || entry.level_labels || {},
          city_like_levels: entry.city_like_levels || [],
          region_auto_assign: entry.region_auto_assign || {},
          notes: entry.notes || '',
          mock: Boolean(entry.mock),
        })),
        region_groups: regionGroups.map((entry) => ({
          region_key: entry.region_key,
          country_code: entry.country_code,
          canonical_language: entry.canonical_language,
          mock: Boolean(entry.mock),
          translation: pickTranslation(entry.translations, language),
        })),
        atlas_places_minimal: atlasPlaces.map((entry) => ({
          place_id: entry.place_id,
          place_type: entry.place_type,
          country_code: entry.country_code,
          mock: Boolean(entry.mock),
          translation: pickTranslation(entry.translations, language),
        })),
      },
    };

    const fileName = `bundle.${language}.json`;
    const filePath = path.join(outputDir, fileName);
    await writeJson(filePath, payload);
    manifest.files[language] = fileName;
  }

  await writeJson(path.join(outputDir, 'manifest.json'), manifest);

  return {
    output_dir: outputDir,
    manifest: path.join(outputDir, 'manifest.json'),
    locales: SUPPORTED_LANGUAGES,
    counts: {
      ui_pages: uiPages.length,
      country_profiles: countryProfiles.length,
      region_groups: regionGroups.length,
      atlas_places_minimal: atlasPlaces.length,
    },
  };
};

const findByField = async (uid, field, value, populate = []) => {
  const entries = await strapiInstance.entityService.findMany(uid, {
    publicationState: 'preview',
    filters: { [field]: value },
    populate,
    limit: 1,
  });
  return (Array.isArray(entries) ? entries : [entries]).filter(Boolean).map(asEntity)[0] || null;
};

const findRegionGroup = async (regionKey, countryCode) => {
  const entries = await strapiInstance.entityService.findMany('api::region-group.region-group', {
    publicationState: 'preview',
    filters: {
      region_key: regionKey,
      country_code: countryCode,
    },
    populate: ['translations'],
    limit: 1,
  });

  return (Array.isArray(entries) ? entries : [entries]).filter(Boolean).map(asEntity)[0] || null;
};

const importBundles = async (inputDir) => {
  if (!isTrue(process.env.TRANSLATION_BUNDLE_ENABLED)) {
    console.error('[DORMANT] Translation bundle import disabled. Set TRANSLATION_BUNDLE_ENABLED=true for controlled runs.');
    process.exitCode = 1;
    return null;
  }

  const manifestPath = path.join(inputDir, 'manifest.json');
  const manifest = await readJson(manifestPath);

  if (manifest.version !== BUNDLE_VERSION) {
    throw new Error(`Unsupported bundle version: ${manifest.version}`);
  }

  const updates = {
    ui_pages: 0,
    region_groups: 0,
    atlas_places_minimal: 0,
    country_profiles: 0,
  };
  const warnings = [];
  const processedCountryProfiles = new Set();

  for (const language of SUPPORTED_LANGUAGES) {
    const fileName = manifest.files?.[language];
    if (!fileName) {
      warnings.push(`Missing locale file mapping for ${language}`);
      continue;
    }

    const payload = await readJson(path.join(inputDir, fileName));
    const content = payload?.content || {};

    for (const item of content.ui_pages || []) {
      const key = String(item.page_key || '').trim();
      if (!key) continue;

      const entity = await findByField('api::ui-page.ui-page', 'page_key', key, ['translations']);
      if (!entity) {
        warnings.push(`ui_page not found for page_key=${key}`);
        continue;
      }

      const translations = mergeTranslation(entity.translations, language, item.translation || {});
      await strapiInstance.entityService.update('api::ui-page.ui-page', entity.id, {
        data: {
          translations,
        },
      });
      updates.ui_pages += 1;
    }

    for (const item of content.region_groups || []) {
      const regionKey = String(item.region_key || '').trim();
      const countryCode = String(item.country_code || '').trim().toUpperCase();
      if (!regionKey || !countryCode) continue;

      const entity = await findRegionGroup(regionKey, countryCode);
      if (!entity) {
        warnings.push(`region_group not found for ${countryCode}:${regionKey}`);
        continue;
      }

      const translations = mergeTranslation(entity.translations, language, item.translation || {});
      await strapiInstance.entityService.update('api::region-group.region-group', entity.id, {
        data: {
          translations,
        },
      });
      updates.region_groups += 1;
    }

    for (const item of content.atlas_places_minimal || []) {
      const placeId = String(item.place_id || '').trim();
      if (!placeId) continue;

      const entity = await findByField('api::atlas-place.atlas-place', 'place_id', placeId, ['translations']);
      if (!entity) {
        warnings.push(`atlas_place not found for place_id=${placeId}`);
        continue;
      }

      const translations = mergeTranslation(entity.translations, language, item.translation || {});
      await strapiInstance.entityService.update('api::atlas-place.atlas-place', entity.id, {
        data: {
          translations,
        },
      });
      updates.atlas_places_minimal += 1;
    }

    for (const item of content.country_profiles || []) {
      const countryCode = String(item.country_code || '').trim().toUpperCase();
      if (!countryCode || processedCountryProfiles.has(countryCode)) continue;

      const entity = await findByField('api::country-profile.country-profile', 'country_code', countryCode);
      if (!entity) {
        warnings.push(`country_profile not found for country_code=${countryCode}`);
        continue;
      }

      const updatePayload = {};
      for (const field of SAFE_COUNTRY_PROFILE_FIELDS) {
        if (field in item) {
          updatePayload[field] = clone(item[field]);
        }
      }

      if (Object.keys(updatePayload).length === 0) {
        processedCountryProfiles.add(countryCode);
        continue;
      }

      await strapiInstance.entityService.update('api::country-profile.country-profile', entity.id, {
        data: updatePayload,
      });
      updates.country_profiles += 1;
      processedCountryProfiles.add(countryCode);
    }
  }

  return {
    input_dir: inputDir,
    manifest: manifestPath,
    updates,
    warnings,
  };
};

const run = async () => {
  const command = String(process.argv[2] || '').trim().toLowerCase();
  const targetDir = path.resolve(process.argv[3] || path.join(APP_DIR, 'artifacts/translation-bundle/latest'));

  if (!['export', 'import'].includes(command)) {
    console.error('Usage: node scripts/manage_translation_bundle.js <export|import> [dir]');
    process.exit(1);
  }

  if (command === 'import' && !isTrue(process.env.TRANSLATION_BUNDLE_ENABLED)) {
    console.error('[DORMANT] Translation bundle import disabled. Set TRANSLATION_BUNDLE_ENABLED=true for controlled runs.');
    process.exit(1);
  }

  const app = await createAppInstance();
  strapiInstance = app;

  try {
    if (command === 'export') {
      const result = await exportBundles(targetDir);
      console.log(JSON.stringify({ ok: true, command, ...result }, null, 2));
      return;
    }

    const result = await importBundles(targetDir);
    if (!result) {
      return;
    }

    console.log(JSON.stringify({ ok: true, command, ...result }, null, 2));
  } finally {
    await app.destroy();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
