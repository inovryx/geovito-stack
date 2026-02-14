import { defineConfig, devices } from '@playwright/test';

const PORT = 4322;
const ANALYTICS_PORT = 4323;
const CONSENT_PORT = 4324;
const GTM_STRICT_PORT = 4325;
const GTM_LOAD_BEFORE_PORT = 4326;
const SENTRY_PORT = 4327;
const ALLOW_LOCALHOST_STRAPI = process.env.ALLOW_LOCALHOST_STRAPI || 'true';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: `npm run build -- --outDir dist-default && node scripts/static_preview.mjs --dir dist-default --port ${PORT}`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        STRAPI_URL: process.env.STRAPI_URL || 'http://127.0.0.1:1337',
        ALLOW_LOCALHOST_STRAPI,
        PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || 'https://www.geovito.com',
        PUBLIC_ADS_ENABLED: process.env.PUBLIC_ADS_ENABLED || 'false',
        PUBLIC_ANALYTICS_ENABLED: 'false',
      },
    },
    {
      command: `PUBLIC_ANALYTICS_ENABLED=true PUBLIC_ANALYTICS_PROVIDER=console npm run build -- --outDir dist-analytics && node scripts/static_preview.mjs --dir dist-analytics --port ${ANALYTICS_PORT}`,
      port: ANALYTICS_PORT,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        STRAPI_URL: process.env.STRAPI_URL || 'http://127.0.0.1:1337',
        ALLOW_LOCALHOST_STRAPI,
        PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || 'https://www.geovito.com',
        PUBLIC_ADS_ENABLED: process.env.PUBLIC_ADS_ENABLED || 'false',
        PUBLIC_ANALYTICS_ENABLED: 'true',
        PUBLIC_ANALYTICS_PROVIDER: 'console',
      },
    },
    {
      command: `PUBLIC_ANALYTICS_ENABLED=true PUBLIC_ANALYTICS_PROVIDER=console PUBLIC_ADS_ENABLED=true PUBLIC_ADS_SCRIPT_URL=https://example.com/mock-ads.js npm run build -- --outDir dist-consent && node scripts/static_preview.mjs --dir dist-consent --port ${CONSENT_PORT}`,
      port: CONSENT_PORT,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        STRAPI_URL: process.env.STRAPI_URL || 'http://127.0.0.1:1337',
        ALLOW_LOCALHOST_STRAPI,
        PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || 'https://www.geovito.com',
        PUBLIC_ADS_ENABLED: 'true',
        PUBLIC_ADS_SCRIPT_URL: 'https://example.com/mock-ads.js',
        PUBLIC_ANALYTICS_ENABLED: 'true',
        PUBLIC_ANALYTICS_PROVIDER: 'console',
      },
    },
    {
      command: `PUBLIC_ANALYTICS_ENABLED=true PUBLIC_ANALYTICS_PROVIDER=dataLayer PUBLIC_TAG_MANAGER=gtm PUBLIC_GTM_ID=GTM-TEST PUBLIC_GTM_LOAD_BEFORE_CONSENT=false PUBLIC_GA4_MODE=gtm npm run build -- --outDir dist-gtm-strict && node scripts/static_preview.mjs --dir dist-gtm-strict --port ${GTM_STRICT_PORT}`,
      port: GTM_STRICT_PORT,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        STRAPI_URL: process.env.STRAPI_URL || 'http://127.0.0.1:1337',
        ALLOW_LOCALHOST_STRAPI,
        PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || 'https://www.geovito.com',
        PUBLIC_ANALYTICS_ENABLED: 'true',
        PUBLIC_ANALYTICS_PROVIDER: 'dataLayer',
        PUBLIC_TAG_MANAGER: 'gtm',
        PUBLIC_GTM_ID: 'GTM-TEST',
        PUBLIC_GTM_LOAD_BEFORE_CONSENT: 'false',
        PUBLIC_GA4_MODE: 'gtm',
      },
    },
    {
      command: `PUBLIC_ANALYTICS_ENABLED=true PUBLIC_ANALYTICS_PROVIDER=dataLayer PUBLIC_TAG_MANAGER=gtm PUBLIC_GTM_ID=GTM-TEST PUBLIC_GTM_LOAD_BEFORE_CONSENT=true PUBLIC_GA4_MODE=gtm npm run build -- --outDir dist-gtm-before && node scripts/static_preview.mjs --dir dist-gtm-before --port ${GTM_LOAD_BEFORE_PORT}`,
      port: GTM_LOAD_BEFORE_PORT,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        STRAPI_URL: process.env.STRAPI_URL || 'http://127.0.0.1:1337',
        ALLOW_LOCALHOST_STRAPI,
        PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || 'https://www.geovito.com',
        PUBLIC_ANALYTICS_ENABLED: 'true',
        PUBLIC_ANALYTICS_PROVIDER: 'dataLayer',
        PUBLIC_TAG_MANAGER: 'gtm',
        PUBLIC_GTM_ID: 'GTM-TEST',
        PUBLIC_GTM_LOAD_BEFORE_CONSENT: 'true',
        PUBLIC_GA4_MODE: 'gtm',
      },
    },
    {
      command: `PUBLIC_SENTRY_ENABLED=true PUBLIC_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 PUBLIC_SENTRY_ENV=production PUBLIC_SENTRY_RELEASE=test-release PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0 npm run build -- --mode test --outDir dist-sentry && node scripts/static_preview.mjs --dir dist-sentry --port ${SENTRY_PORT}`,
      port: SENTRY_PORT,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        STRAPI_URL: process.env.STRAPI_URL || 'http://127.0.0.1:1337',
        ALLOW_LOCALHOST_STRAPI,
        PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || 'https://www.geovito.com',
        PUBLIC_SENTRY_ENABLED: 'true',
        PUBLIC_SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        PUBLIC_SENTRY_ENV: 'production',
        PUBLIC_SENTRY_RELEASE: 'test-release',
        PUBLIC_SENTRY_TRACES_SAMPLE_RATE: '0',
      },
    },
  ],
  projects: [
    {
      name: 'desktop',
      testIgnore: /(analytics|consent|gtm-ga4|sentry)\.spec\.ts/,
      use: {
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'tablet',
      testIgnore: /(analytics|consent|gtm-ga4|sentry)\.spec\.ts/,
      use: {
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'mobile',
      testIgnore: /(analytics|consent|gtm-ga4|sentry)\.spec\.ts/,
      use: {
        ...devices['iPhone 12'],
      },
    },
    {
      name: 'analytics-desktop',
      testMatch: /analytics\.spec\.ts/,
      use: {
        baseURL: `http://localhost:${ANALYTICS_PORT}`,
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'consent-desktop',
      testMatch: /consent\.spec\.ts/,
      use: {
        baseURL: `http://localhost:${CONSENT_PORT}`,
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'gtm-ga4-desktop',
      testMatch: /gtm-ga4\.spec\.ts/,
      use: {
        baseURL: `http://localhost:${GTM_STRICT_PORT}`,
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'sentry-desktop',
      testMatch: /sentry\.spec\.ts/,
      use: {
        baseURL: `http://localhost:${SENTRY_PORT}`,
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
