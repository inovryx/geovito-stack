import { expect, test } from '@playwright/test';

test('smart sticky header hides on down scroll and reappears on up scroll with constant height', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop-only scenario');

  await page.goto('/en/');

  const header = page.locator('[data-site-header]');
  await expect(header).toBeVisible();

  const initialHeight = await header.evaluate((node) => Math.round((node as HTMLElement).getBoundingClientRect().height));
  expect(initialHeight).toBe(64);

  await page.evaluate(() => {
    window.scrollTo({ top: 1200, behavior: 'auto' });
  });
  await page.waitForTimeout(260);
  await expect(header).toHaveClass(/header-hidden/);

  const hiddenHeight = await header.evaluate((node) => Math.round((node as HTMLElement).getBoundingClientRect().height));
  expect(hiddenHeight).toBe(64);

  await page.evaluate(() => {
    window.scrollTo({ top: 500, behavior: 'auto' });
  });
  await page.waitForTimeout(260);
  await expect(header).not.toHaveClass(/header-hidden/);
});

test('desktop sidebar can collapse to icon-only and persists after reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop-only scenario');

  await page.goto('/en/');

  const skipLink = page.locator('.skip-link');
  await expect(skipLink).toHaveAttribute('href', '#main-content');

  const toggle = page.locator('[data-sidebar-toggle]').first();
  await expect(toggle).toBeVisible();

  const firstNavLink = page.locator('.desktop-tablet-column .app-nav-link').first();
  await expect(firstNavLink).toHaveAttribute('aria-label', /Home/i);

  const firstLabel = page.locator('.desktop-tablet-column .app-nav-link .nav-link-label').first();
  await expect(firstLabel).toBeVisible();

  await toggle.click();
  await expect(page.locator('html')).toHaveClass(/sidebar-compact/);
  await expect(firstLabel).toBeHidden();
  await expect(page.locator('.desktop-tablet-column .app-nav-link .gv-icon-wrap').first()).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/sidebar-compact/);
  await expect(page.locator('.desktop-tablet-column .app-nav-link .nav-link-label').first()).toBeHidden();
});
