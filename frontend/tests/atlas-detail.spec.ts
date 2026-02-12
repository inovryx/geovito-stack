import { expect, test } from '@playwright/test';

const openAtlasDetail = async (page: import('@playwright/test').Page) => {
  await page.goto('/en/atlas/');
  await expect(page.locator('[data-atlas-skeleton]')).toBeHidden();
  await expect(page.locator('[data-atlas-results]')).toBeVisible();

  const firstResult = page.locator('[data-atlas-item] .atlas-entry-title').first();
  await expect(firstResult).toBeVisible();
  await firstResult.click();

  await expect(page.locator('[data-atlas-place-header]')).toBeVisible();
};

test('atlas detail renders premium sections and keeps in-content ad slot', async ({ page }) => {
  await openAtlasDetail(page);

  await expect(page.locator('[data-atlas-place-header] h1')).toBeVisible();
  await expect(page.locator('[data-atlas-quick-facts]')).toBeVisible();
  await expect(page.locator('[data-atlas-hierarchy]')).toBeVisible();
  await expect(page.locator('[data-ad-slot="atlas_incontent"]')).toBeVisible();
  await expect(page.locator('[data-atlas-related-posts]')).toBeVisible();
  await expect(page.locator('[data-atlas-travel-essentials]')).toBeVisible();
});

test('desktop shows sticky mini toc inside center column', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop-only scenario');

  await openAtlasDetail(page);

  const toc = page.locator('[data-atlas-mini-toc-desktop]');
  await expect(toc).toBeVisible();

  const position = await toc.evaluate((node) => window.getComputedStyle(node as HTMLElement).position);
  expect(position).toBe('sticky');
});

test('mobile/tablet keeps toc accessible without breaking layout', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'Tablet/mobile only');

  await openAtlasDetail(page);

  await expect(page.locator('[data-atlas-mini-toc-mobile]')).toBeVisible();

  const hasOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });

  expect(hasOverflow).toBeFalsy();
});
