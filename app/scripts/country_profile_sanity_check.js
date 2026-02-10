'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');
let strapiInstance = null;

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

const normalizeCountryCode = (value) => String(value || '').trim().toUpperCase();
const normalizeKey = (value) => String(value || '').trim().toLowerCase();

const loadCollection = async (uid, options = {}) => {
  const list = await strapiInstance.entityService.findMany(uid, {
    publicationState: 'preview',
    ...options,
    pagination: undefined,
    limit: 1000,
  });

  if (!Array.isArray(list)) {
    return list ? [asEntity(list)] : [];
  }

  return list.map(asEntity);
};

const getMapObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const addError = (errors, message) => {
  errors.push(message);
};

const addWarning = (warnings, message) => {
  warnings.push(message);
};

const validateCaseInsensitiveDuplicateKeys = (source, label, errors) => {
  const seen = new Map();
  for (const [rawKey] of Object.entries(source)) {
    const normalized = normalizeKey(rawKey);
    if (!normalized) continue;
    if (seen.has(normalized)) {
      addError(errors, `${label}: duplicate key detected after normalization (${rawKey} vs ${seen.get(normalized)})`);
      continue;
    }
    seen.set(normalized, rawKey);
  }
};

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

const run = async () => {
  const app = await createAppInstance();
  strapiInstance = app;

  try {
    const [profiles, regionGroups, places] = await Promise.all([
      loadCollection('api::country-profile.country-profile'),
      loadCollection('api::region-group.region-group', {
        fields: ['id', 'region_key', 'country_code'],
      }),
      loadCollection('api::atlas-place.atlas-place', {
        fields: ['id', 'place_id', 'place_type', 'slug', 'country_code', 'mock'],
      }),
    ]);

    const errors = [];
    const warnings = [];

    const regionsByCountry = new Map();
    for (const regionGroup of regionGroups) {
      const countryCode = normalizeCountryCode(regionGroup.country_code);
      const key = normalizeKey(regionGroup.region_key);
      if (!countryCode || !key) continue;
      if (!regionsByCountry.has(countryCode)) {
        regionsByCountry.set(countryCode, new Set());
      }
      regionsByCountry.get(countryCode).add(key);
    }

    const placesById = new Map();
    const placesBySlug = new Map();
    const admin1BySlug = new Map();

    for (const place of places) {
      const countryCode = normalizeCountryCode(place.country_code);
      const placeId = String(place.place_id || '').trim();
      const slug = normalizeKey(place.slug || '');
      const type = normalizeKey(place.place_type || '');

      if (placeId) {
        placesById.set(placeId, place);
      }

      if (slug) {
        const slugKey = `${countryCode}:${slug}`;
        if (!placesBySlug.has(slugKey)) {
          placesBySlug.set(slugKey, []);
        }
        placesBySlug.get(slugKey).push(place);

        if (type === 'admin1') {
          admin1BySlug.set(slugKey, place);
        }
      }
    }

    for (const profile of profiles) {
      const countryCode = normalizeCountryCode(profile.country_code);
      if (!countryCode) {
        addError(errors, `country_profile#${profile.id}: country_code is empty`);
        continue;
      }

      const enabledLevels = Array.isArray(profile.enabled_levels) ? profile.enabled_levels.map(normalizeKey) : [];
      if (!enabledLevels.includes('country')) {
        addError(errors, `country_profile#${profile.id}(${countryCode}): enabled_levels must include country`);
      }

      const cityLikeLevels = Array.isArray(profile.city_like_levels)
        ? profile.city_like_levels.map(normalizeKey).filter(Boolean)
        : [];
      for (const cityLikeLevel of cityLikeLevels) {
        if (!enabledLevels.includes(cityLikeLevel)) {
          addError(
            errors,
            `country_profile#${profile.id}(${countryCode}): city_like_levels contains ${cityLikeLevel} which is not in enabled_levels`
          );
        }
      }

      const regionAutoAssign = getMapObject(profile.region_auto_assign);
      const byPlaceId = getMapObject(regionAutoAssign.by_place_id);
      const bySlug = getMapObject(regionAutoAssign.by_slug);
      const byAdmin1PlaceId = getMapObject(regionAutoAssign.by_admin1_place_id);
      const byAdmin1Slug = getMapObject(regionAutoAssign.by_admin1_slug);

      validateCaseInsensitiveDuplicateKeys(byPlaceId, `country_profile#${profile.id}(${countryCode}) by_place_id`, errors);
      validateCaseInsensitiveDuplicateKeys(bySlug, `country_profile#${profile.id}(${countryCode}) by_slug`, errors);
      validateCaseInsensitiveDuplicateKeys(
        byAdmin1PlaceId,
        `country_profile#${profile.id}(${countryCode}) by_admin1_place_id`,
        errors
      );
      validateCaseInsensitiveDuplicateKeys(byAdmin1Slug, `country_profile#${profile.id}(${countryCode}) by_admin1_slug`, errors);

      const knownRegions = regionsByCountry.get(countryCode) || new Set();

      const assertRegionExists = (mapLabel, sourceMap) => {
        for (const [key, rawRegion] of Object.entries(sourceMap)) {
          const regionKey = normalizeKey(rawRegion);
          if (!regionKey) {
            addError(errors, `country_profile#${profile.id}(${countryCode}) ${mapLabel}.${key}: region key is empty`);
            continue;
          }
          if (!knownRegions.has(regionKey)) {
            addError(
              errors,
              `country_profile#${profile.id}(${countryCode}) ${mapLabel}.${key}: region_group '${regionKey}' does not exist`
            );
          }
        }
      };

      assertRegionExists('by_place_id', byPlaceId);
      assertRegionExists('by_slug', bySlug);
      assertRegionExists('by_admin1_place_id', byAdmin1PlaceId);
      assertRegionExists('by_admin1_slug', byAdmin1Slug);

      for (const [placeId] of Object.entries(byPlaceId)) {
        const place = placesById.get(placeId);
        if (!place) {
          addError(errors, `country_profile#${profile.id}(${countryCode}) by_place_id.${placeId}: place_id not found`);
          continue;
        }
        if (normalizeCountryCode(place.country_code) !== countryCode) {
          addError(
            errors,
            `country_profile#${profile.id}(${countryCode}) by_place_id.${placeId}: place belongs to ${place.country_code}`
          );
        }
      }

      for (const [rawSlug] of Object.entries(bySlug)) {
        const slugKey = `${countryCode}:${normalizeKey(rawSlug)}`;
        const matches = placesBySlug.get(slugKey) || [];
        if (matches.length === 0) {
          addError(errors, `country_profile#${profile.id}(${countryCode}) by_slug.${rawSlug}: no place found for slug`);
        }
      }

      for (const [placeId] of Object.entries(byAdmin1PlaceId)) {
        const place = placesById.get(placeId);
        if (!place) {
          addError(errors, `country_profile#${profile.id}(${countryCode}) by_admin1_place_id.${placeId}: place_id not found`);
          continue;
        }
        if (normalizeCountryCode(place.country_code) !== countryCode) {
          addError(
            errors,
            `country_profile#${profile.id}(${countryCode}) by_admin1_place_id.${placeId}: place belongs to ${place.country_code}`
          );
        }
        if (normalizeKey(place.place_type) !== 'admin1') {
          addError(
            errors,
            `country_profile#${profile.id}(${countryCode}) by_admin1_place_id.${placeId}: place_type must be admin1`
          );
        }
      }

      for (const [rawSlug] of Object.entries(byAdmin1Slug)) {
        const slugKey = `${countryCode}:${normalizeKey(rawSlug)}`;
        if (!admin1BySlug.has(slugKey)) {
          addError(errors, `country_profile#${profile.id}(${countryCode}) by_admin1_slug.${rawSlug}: admin1 slug not found`);
        }
      }

      if (knownRegions.size === 0) {
        addWarning(
          warnings,
          `country_profile#${profile.id}(${countryCode}): country has no region_group records (auto-region mappings cannot resolve)`
        );
      }
    }

    const report = {
      ok: errors.length === 0,
      checked_at: new Date().toISOString(),
      counts: {
        country_profiles: profiles.length,
        region_groups: regionGroups.length,
        atlas_places: places.length,
      },
      errors,
      warnings,
    };

    console.log(JSON.stringify(report, null, 2));

    if (errors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.destroy();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
