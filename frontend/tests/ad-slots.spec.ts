import { expect, test } from '@playwright/test';

const waitForAtlasListReady = async (page: import('@playwright/test').Page) => {
  await page.goto('/en/atlas/');
  await expect(page.locator('[data-atlas-skeleton]')).toBeHidden();
  await expect(page.locator('[data-atlas-results]')).toBeVisible();
};

test('home ad slot exists and reserves layout space', async ({ page }) => {
  await page.goto('/en/');

  const homeSlot = page.locator('[data-ad-slot="home_mid"]');
  await expect(homeSlot).toBeVisible();

  const dimensions = await homeSlot.evaluate((node) => {
    const computed = window.getComputedStyle(node as HTMLElement);
    return {
      minHeight: Number.parseFloat(computed.minHeight || '0'),
    };
  });

  expect(dimensions.minHeight).toBeGreaterThan(0);
});

test('atlas detail page renders in-content ad slot', async ({ page }) => {
  await waitForAtlasListReady(page);

  const firstResult = page.locator('[data-atlas-item] .atlas-entry-title').first();
  await expect(firstResult).toBeVisible();
  await firstResult.click();

  await expect(page.locator('[data-ad-slot="atlas_incontent"]')).toBeVisible();
});

test('search page does not render ad slots', async ({ page }) => {
  await page.goto('/en/search/');
  await expect(page.locator('[data-ad-slot]')).toHaveCount(0);
});

test('dark mode keeps ad slot frame readable', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('theme', 'dark');
  });

  await page.goto('/en/');
  await expect(page.locator('html')).toHaveClass(/dark/);

  const adFrame = page.locator('[data-ad-slot="home_mid"] .gv-ad-frame');
  await expect(adFrame).toBeVisible();

  const colors = await adFrame.evaluate((node) => {
    const computed = window.getComputedStyle(node as HTMLElement);
    return {
      background: computed.backgroundColor,
      border: computed.borderColor,
    };
  });

  expect(colors.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(colors.border).not.toBe('rgba(0, 0, 0, 0)');
});
