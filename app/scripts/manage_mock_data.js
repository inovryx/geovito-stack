'use strict';

const { createStrapi } = require('@strapi/core');
const path = require('path');

const { seedMockData, clearMockData } = require('../src/modules/mock-data');
const { ensureLogRuntime, log } = require('../src/modules/domain-logging');

const usage = () => {
  console.log('Usage: node scripts/manage_mock_data.js <seed|clear>');
  console.log('Seed requires: ALLOW_MOCK_SEED=true');
};

const isTrue = (value) => String(value || '').trim().toLowerCase() === 'true';

const printBanner = (lines) => {
  const border = '='.repeat(72);
  console.log(`\n${border}`);
  for (const line of lines) {
    console.log(line);
  }
  console.log(`${border}\n`);
};

const createAppInstance = async () => {
  const appDir = path.resolve(__dirname, '..');
  const strapi = createStrapi({
    appDir,
    distDir: appDir,
    autoReload: false,
    serveAdminPanel: false,
  });

  await strapi.load();
  return strapi;
};

const run = async () => {
  const command = process.argv[2];
  const isProduction = String(process.env.NODE_ENV || 'development').toLowerCase() === 'production';

  if (!command || !['seed', 'clear'].includes(command)) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (command === 'seed' && !isTrue(process.env.ALLOW_MOCK_SEED)) {
    printBanner([
      'MOCK SEED BLOCKED',
      'Set ALLOW_MOCK_SEED=true explicitly to seed mock records.',
      'Example: ALLOW_MOCK_SEED=true npm run mock:seed',
    ]);
    process.exitCode = 1;
    return;
  }

  if (command === 'seed') {
    printBanner([
      'WARNING: MOCK DATA SEED REQUESTED',
      `NODE_ENV=${process.env.NODE_ENV || 'development'}`,
      'Seed includes mock records (mock=true) plus one controlled non-mock pilot (country-it-pilot).',
      'Only complete + mock=false pages may become indexable.',
    ]);
  }

  if (command === 'clear' && isProduction) {
    printBanner([
      'WARNING: MOCK CLEAR IN PRODUCTION MODE',
      'This is allowed and idempotent.',
    ]);
  }

  const strapi = await createAppInstance();

  try {
    await ensureLogRuntime();

    if (command === 'seed') {
      await seedMockData(strapi);
      strapi.log.info('Mock data seeded');
      await log(
        'ops',
        'WARN',
        'mock.seed.completed',
        'Mock data seeded via CLI command',
        {
          command: 'mock:seed',
          environment: process.env.NODE_ENV || 'development',
        },
        {
          actor: 'system',
          entity_ref: 'mock-data',
        }
      );
    }

    if (command === 'clear') {
      const summary = await clearMockData(strapi);
      strapi.log.info(`Mock data cleared: ${JSON.stringify(summary)}`);
      await log(
        'ops',
        'WARN',
        'mock.clear.completed',
        'Mock data cleared via CLI command',
        {
          command: 'mock:clear',
          summary,
          environment: process.env.NODE_ENV || 'development',
        },
        {
          actor: 'system',
          entity_ref: 'mock-data',
        }
      );
    }
  } finally {
    await strapi.destroy();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
