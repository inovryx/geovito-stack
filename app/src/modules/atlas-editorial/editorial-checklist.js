'use strict';

const { SUPPORTED_LANGUAGES, languageSuffix } = require('./constants');

const isBlank = (value) => typeof value !== 'string' || value.trim().length === 0;

const normalizeSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const getPlaceRecord = (entity) => {
  if (!entity) return {};
  if (entity.attributes) {
    return {
      id: entity.id,
      ...entity.attributes,
    };
  }
  return entity;
};

const getTranslationByLanguage = (translations, language) =>
  (Array.isArray(translations) ? translations : []).find((item) => item?.language === language) || null;

const normalizeType = (value) => String(value || '').trim().toLowerCase();

const buildEditorialSnapshot = (entity) => {
  const place = getPlaceRecord(entity);
  const translations = Array.isArray(place.translations) ? place.translations : [];
  const snapshot = {};

  for (const language of SUPPORTED_LANGUAGES) {
    const suffix = languageSuffix(language);
    const entry = getTranslationByLanguage(translations, language);

    snapshot[`title_${suffix}`] = entry?.title || null;
    snapshot[`summary_${suffix}`] = entry?.excerpt || null;
    snapshot[`body_${suffix}`] = entry?.body || null;
    snapshot[`language_state_${suffix}`] = entry?.status || 'missing';
    snapshot[`last_reviewed_at_${suffix}`] = entry?.last_reviewed_at || null;
  }

  return snapshot;
};

const buildChecklistForLanguage = (entity, language) => {
  const place = getPlaceRecord(entity);
  const translations = Array.isArray(place.translations) ? place.translations : [];
  const translation = getTranslationByLanguage(translations, language);

  const parentPlaceId = place.parent_place_id || place.parent?.place_id || null;
  const titleValue = translation?.title || '';
  const summaryValue = translation?.excerpt || '';
  const bodyValue = translation?.body || '';
  const slugValue = translation?.slug || '';
  const normalizedSlug = normalizeSlug(slugValue);

  const hasTitle = !isBlank(titleValue);
  const hasSummary = !isBlank(summaryValue);
  const hasBody = !isBlank(bodyValue);
  const hasParent = place.place_type === 'country' ? true : Boolean(parentPlaceId);
  const hasType = !isBlank(place.place_type);
  const slugOk = !isBlank(slugValue) && normalizedSlug === slugValue;
  const state = translation?.status || 'missing';
  const normalizedType = normalizeType(place.place_type);
  const parentRules =
    place?.country_profile && typeof place.country_profile === 'object' && !Array.isArray(place.country_profile)
      ? place.country_profile.parent_rules || {}
      : {};
  const labelMapping =
    place?.country_profile && typeof place.country_profile === 'object' && !Array.isArray(place.country_profile)
      ? place.country_profile.label_mapping || place.country_profile.level_labels || {}
      : {};
  const expectedParentTypes = Array.isArray(parentRules[normalizedType]) ? parentRules[normalizedType] : [];
  const expectedParentLabels = expectedParentTypes.map((type) => String(labelMapping[type] || type));

  return {
    language,
    state,
    expected_parent_types: expectedParentTypes,
    expected_parent_labels: expectedParentLabels,
    profile_country_code: place.country_profile?.country_code || null,
    complete_ready: hasTitle && hasBody && hasParent && hasType && slugOk,
    checks: {
      title_present: hasTitle,
      summary_present: hasSummary,
      body_present: hasBody,
      parent_set: hasParent,
      type_set: hasType,
      slug_ok: slugOk,
    },
  };
};

const buildEditorialChecklist = (entity) => {
  const checklist = {};
  for (const language of SUPPORTED_LANGUAGES) {
    checklist[language] = buildChecklistForLanguage(entity, language);
  }
  return checklist;
};

module.exports = {
  buildEditorialSnapshot,
  buildChecklistForLanguage,
  buildEditorialChecklist,
};
