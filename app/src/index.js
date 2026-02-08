'use strict';

const { seedMockData } = require('./modules/mock-data');
const { ensureLogRuntime } = require('./modules/domain-logging');

const isTrue = (value) => String(value || '').trim().toLowerCase() === 'true';

module.exports = {
  register() {},
  async bootstrap({ strapi }) {
    const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();
    const isProduction = nodeEnv === 'production';
    const seedOnBoot = isTrue(process.env.SEED_ON_BOOT);
    const seedMockOnBoot = isTrue(process.env.SEED_MOCK_ON_BOOT);

    const logRoot = await ensureLogRuntime();
    strapi.log.info(`Domain logs ready at ${logRoot}`);

    if (isProduction && seedMockOnBoot) {
      throw new Error(
        [
          'FATAL: SEED_MOCK_ON_BOOT=true cannot be used in production mode.',
          'Set SEED_MOCK_ON_BOOT=false and seed manually with explicit guard:',
          'ALLOW_MOCK_SEED=true npm run mock:seed',
        ].join(' ')
      );
    }

    if (seedOnBoot) {
      strapi.log.warn(
        'SEED_ON_BOOT=true is reserved for controlled bootstrap workflows. No automatic seed action is configured.'
      );
    }

    if (seedMockOnBoot) {
      strapi.log.info('Mock bootstrap seed started');
      await seedMockData(strapi);
      strapi.log.info('Mock bootstrap seed finished');
    }
  },
};
