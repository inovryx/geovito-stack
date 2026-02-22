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

  const languageBlock = page.locator('.desktop-tablet-column .sidebar-language-switch');
  const authBlock = page.locator('.desktop-tablet-column .sidebar-auth-links');
  await expect(languageBlock).toBeVisible();
  await expect(authBlock).toBeVisible();

  await toggle.click();
  await expect(page.locator('html')).toHaveClass(/sidebar-compact/);
  await expect(languageBlock).toBeVisible();
  await expect(authBlock).toBeHidden();

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/sidebar-compact/);
  await expect(page.locator('.desktop-tablet-column .sidebar-language-switch')).toBeVisible();
  await expect(page.locator('.desktop-tablet-column .sidebar-auth-links')).toBeHidden();
});

test('mobile drawer traps focus, closes on ESC, and restores focus to opener', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only scenario');

  await page.goto('/en/');

  const trigger = page.locator('[data-shell-menu-open]').first();
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await trigger.click();

  const drawer = page.locator('[data-shell-drawer]');
  await expect(drawer).toHaveClass(/is-open/);
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');

  const closeButton = page.locator('[data-shell-menu-close]').first();
  await expect(closeButton).toBeFocused();

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab');
    const focusInsideDrawer = await page.evaluate(() => {
      const active = document.activeElement;
      const drawerNode = document.querySelector('[data-shell-drawer]');
      return Boolean(active && drawerNode?.contains(active));
    });
    expect(focusInsideDrawer).toBeTruthy();
  }

  await page.keyboard.press('Escape');
  await expect(drawer).not.toHaveClass(/is-open/);
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
  await expect(trigger).toBeFocused();
});

test('active nav and current pagination item expose aria-current', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop-only scenario');

  await page.goto('/en/atlas/');
  await expect(page.locator('[data-atlas-skeleton]')).toBeHidden();

  await expect(page.locator('.site-header-nav .site-header-nav-link[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('.site-header-nav .site-header-nav-link[aria-current="page"]')).toHaveAttribute('href', /\/en\/atlas\/$/);

  await expect(page.locator('[data-atlas-page-link][aria-current="page"]')).toHaveCount(1);
});
