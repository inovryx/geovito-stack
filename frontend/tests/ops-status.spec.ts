import { expect, test } from '@playwright/test';

const OPS_ENABLED_BASE_URL = 'http://localhost:4328';
const TEST_SHA = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

test('ops status route redirects away when feature is disabled', async ({ page }) => {
  await page.goto('/en/ops/status/');

  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.locator('[data-ops-status-title]')).toHaveCount(0);
});

test('ops status is noindex and GTM ID is redacted when enabled', async ({ page }) => {
  await page.goto(`${OPS_ENABLED_BASE_URL}/en/ops/status/`);

  await expect(page.locator('meta[name="geovito:ops"]')).toHaveAttribute('content', 'enabled');
  await expect(page.locator('[data-ops-status-title]')).toHaveText('System Status');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');

  await expect(page.locator('[data-gtm-id-redacted]')).toHaveText('GTM-****1234');
  await expect(page.locator('[data-gtm-id-redacted]')).not.toContainText('GTM-ABCD1234');
});

test('pages-like env injects build dataset and status shows short SHA', async ({ page }) => {
  await page.goto(`${OPS_ENABLED_BASE_URL}/en/ops/status/`);

  const dataset = await page.evaluate(() => ({
    sha: document.documentElement.dataset.buildSha || '',
    branch: document.documentElement.dataset.buildBranch || '',
    cfPages: document.documentElement.dataset.cfPages || '',
  }));

  expect(dataset.sha).toBe(TEST_SHA);
  expect(dataset.branch).toBe('main');
  expect(dataset.cfPages).toBe('1');

  await expect(page.locator('[data-ops-status-title]')).toHaveText('System Status');
  await expect(page.locator('[data-build-sha-short]')).toHaveText('deadbeef');
});

test('error page remains noindex,nofollow', async ({ page }) => {
  await page.goto('/en/error/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
});
