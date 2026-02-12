import { defineConfig, devices } from '@playwright/test';

const PORT = 4322;

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
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      STRAPI_URL: process.env.STRAPI_URL || 'http://127.0.0.1:1337',
      PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || 'https://www.geovito.com',
      PUBLIC_ADS_ENABLED: process.env.PUBLIC_ADS_ENABLED || 'false',
    },
  },
  projects: [
    {
      name: 'desktop',
      use: {
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'tablet',
      use: {
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 12'],
      },
    },
  ],
});
