'use strict';

const { createLanguageStateLifecycle } = require('../../../../modules/language-state');
const { placeValidation } = require('../../../../modules/atlas-editorial');

const UID = 'api::atlas-place.atlas-place';

const languageLifecycle = createLanguageStateLifecycle({
  uid: UID,
  contextLabel: 'atlas-place',
});

module.exports = {
  beforeCreate(event) {
    languageLifecycle.beforeCreate(event);
    return placeValidation.beforeCreate(event, UID);
  },
  async beforeUpdate(event) {
    await languageLifecycle.beforeUpdate(event);
    await placeValidation.beforeUpdate(event, UID);
  },
};
