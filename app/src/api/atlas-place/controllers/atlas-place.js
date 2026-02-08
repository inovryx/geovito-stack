'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const {
  buildEditorialSnapshot,
  buildChecklistForLanguage,
  buildEditorialChecklist,
} = require('../../../modules/atlas-editorial');
const { SUPPORTED_LANGUAGES } = require('../../../modules/language-state/constants');
const { log } = require('../../../modules/domain-logging');
const { resolveActor } = require('../../../modules/domain-logging/context');

const asRecord = (entry) => {
  if (!entry) return null;
  if (entry.attributes) {
    return {
      id: entry.id,
      ...entry.attributes,
    };
  }
  return entry;
};

const attachEditorial = (entry) => {
  if (!entry) return entry;
  const place = asRecord(entry);
  const editorial = {
    snapshot: buildEditorialSnapshot(place),
    checklist: buildEditorialChecklist(place),
  };

  if (entry.attributes) {
    return {
      ...entry,
      attributes: {
        ...entry.attributes,
        editorial,
      },
    };
  }

  return {
    ...entry,
    editorial,
  };
};

const normalizeLanguage = (value) => String(value || '').trim().toLowerCase();

module.exports = createCoreController('api::atlas-place.atlas-place', ({ strapi }) => ({
  async find(ctx) {
    const response = await super.find(ctx);
    if (Array.isArray(response?.data)) {
      response.data = response.data.map(attachEditorial);
    }
    return response;
  },

  async findOne(ctx) {
    const response = await super.findOne(ctx);
    if (response?.data) {
      response.data = attachEditorial(response.data);
    }
    return response;
  },

  async editorialChecklist(ctx) {
    const placeId = String(ctx.params?.placeId || '').trim();
    if (!placeId) {
      return ctx.badRequest('placeId is required');
    }

    const requestedLanguage = normalizeLanguage(ctx.query?.language);
    if (requestedLanguage && !SUPPORTED_LANGUAGES.includes(requestedLanguage)) {
      return ctx.badRequest(`language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
    }

    const entries = await strapi.entityService.findMany('api::atlas-place.atlas-place', {
      publicationState: 'preview',
      filters: { place_id: placeId },
      populate: ['translations', 'parent', 'children'],
      limit: 1,
    });

    const place = entries[0];
    if (!place) {
      return ctx.notFound(`Atlas place not found for place_id=${placeId}`);
    }

    const responsePayload = {
      place_id: place.place_id,
      place_type: place.place_type,
      country_code: place.country_code,
      parent_place_id: place.parent_place_id || place.parent?.place_id || null,
      snapshot: buildEditorialSnapshot(place),
      checklist: buildEditorialChecklist(place),
      selected_language: requestedLanguage || null,
      selected_checklist: requestedLanguage ? buildChecklistForLanguage(place, requestedLanguage) : null,
    };

    await log(
      'atlas',
      'INFO',
      'atlas.editorial.checklist.read',
      'Atlas editorial checklist requested',
      {
        place_id: placeId,
        language: requestedLanguage || null,
      },
      {
        request_id: ctx.state?.requestId || null,
        actor: resolveActor(ctx),
        entity_ref: placeId,
      }
    );

    ctx.body = { data: responsePayload };
  },
}));
