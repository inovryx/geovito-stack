import { defineConfig, devices } from '@playwright/test';

const PORT = 4322;
const ANALYTICS_PORT = 4323;
const CONSENT_PORT = 4324;

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
      command: `npm run build && npm run preview -- --port ${PORT}`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        STRAPI_URL: process.env.STRAPI_URL || 'http://127.0.0.1:1337',
        PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || 'https://www.geovito.com',
        PUBLIC_ADS_ENABLED: process.env.PUBLIC_ADS_ENABLED || 'false',
        PUBLIC_ANALYTICS_ENABLED: 'false',
      },
    },
    {
      command: `PUBLIC_ANALYTICS_ENABLED=true PUBLIC_ANALYTICS_PROVIDER=console npm run build && npm run preview -- --port ${ANALYTICS_PORT}`,
      port: ANALYTICS_PORT,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        STRAPI_URL: process.env.STRAPI_URL || 'http://127.0.0.1:1337',
        PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || 'https://www.geovito.com',
        PUBLIC_ADS_ENABLED: process.env.PUBLIC_ADS_ENABLED || 'false',
        PUBLIC_ANALYTICS_ENABLED: 'true',
        PUBLIC_ANALYTICS_PROVIDER: 'console',
      },
    },
    {
      command: `PUBLIC_ANALYTICS_ENABLED=true PUBLIC_ANALYTICS_PROVIDER=console PUBLIC_ADS_ENABLED=true PUBLIC_ADS_SCRIPT_URL=https://example.com/mock-ads.js npm run build && npm run preview -- --port ${CONSENT_PORT}`,
      port: CONSENT_PORT,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        STRAPI_URL: process.env.STRAPI_URL || 'http://127.0.0.1:1337',
        PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || 'https://www.geovito.com',
        PUBLIC_ADS_ENABLED: 'true',
        PUBLIC_ADS_SCRIPT_URL: 'https://example.com/mock-ads.js',
        PUBLIC_ANALYTICS_ENABLED: 'true',
        PUBLIC_ANALYTICS_PROVIDER: 'console',
      },
    },
  ],
  projects: [
    {
      name: 'desktop',
      testIgnore: /(analytics|consent)\.spec\.ts/,
      use: {
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'tablet',
      testIgnore: /(analytics|consent)\.spec\.ts/,
      use: {
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'mobile',
      testIgnore: /(analytics|consent)\.spec\.ts/,
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
  ],
});
