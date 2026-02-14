import { expect, test } from '@playwright/test';

const OPS_ENABLED_BASE_URL = 'http://localhost:4328';

test('ops metrics route redirects away when feature is disabled', async ({ page }) => {
  await page.goto('/en/ops/metrics/');

  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.locator('[data-ops-title]')).toHaveCount(0);
});

test('ops metrics page renders fixture data when enabled in local mode', async ({ page }) => {
  await page.goto(`${OPS_ENABLED_BASE_URL}/en/ops/metrics/`);

  await expect(page.locator('[data-ops-title]')).toHaveText('Ops Metrics');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');

  await expect(page.locator('[data-ops-kpi="sessions_7d"] .ops-kpi-value')).toContainText('1,200');
  await expect(page.locator('[data-ops-provider="ga4"]')).toContainText('OK');
  await expect(page.locator('[data-ops-provider="adsense"]')).toContainText('Not configured');
});
