'use strict';

const crypto = require('crypto');
const { createCoreService } = require('@strapi/strapi').factories;
const { SUGGESTION_STATUS } = require('../../../modules/suggestions/constants');
const { hashIp } = require('../../../modules/suggestions/state-machine');

const buildSuggestionId = () => `sugg_${crypto.randomUUID()}`;

const findTargetPlace = async (targetPlaceRef) => {
  if (!targetPlaceRef) return null;

  const entries = await strapi.entityService.findMany('api::atlas-place.atlas-place', {
    publicationState: 'preview',
    filters: { place_id: targetPlaceRef },
    limit: 1,
  });

  return entries[0] || null;
};

module.exports = createCoreService('api::atlas-suggestion.atlas-suggestion', () => ({
  async createFromPublicSubmission(payload, context = {}) {
    const targetPlace = await findTargetPlace(payload.target_place_ref);

    const data = {
      suggestion_id: buildSuggestionId(),
      status: SUGGESTION_STATUS.NEW,
      suggestion_type: payload.suggestion_type,
      title: payload.title,
      description: payload.description,
      target_place: targetPlace ? targetPlace.id : null,
      target_place_ref: payload.target_place_ref || null,
      evidence_urls: payload.evidence_urls || [],
      language: payload.language || 'en',
      submitted_by_email: payload.submitted_by_email || null,
      submitted_by_display_name: payload.submitted_by_display_name || null,
      source_ip_hash: hashIp(context.clientIp || ''),
    };

    if (context.authenticatedUserId) {
      data.submitted_by_user = context.authenticatedUserId;
    }

    return strapi.entityService.create('api::atlas-suggestion.atlas-suggestion', { data });
  },
}));
