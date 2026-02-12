import { expect, test } from '@playwright/test';

const gotoAtlas = async (page: import('@playwright/test').Page, path = '/en/atlas/') => {
  await page.goto(path);
  await expect(page.locator('[data-atlas-skeleton]')).toBeHidden();
  await expect(page.locator('[data-atlas-results]')).toBeVisible();
};

test('desktop filter chips + pagination update query params and keep tools hidden', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop-only scenario');

  await gotoAtlas(page);

  const chips = page.locator('[data-atlas-chip]');
  await expect(chips).toHaveCount(5);
  await expect(page.locator('[data-atlas-chip][data-kind="country"]')).toHaveAttribute('href', /kind=country/);

  await page.locator('[data-atlas-chip][data-kind="city"]').click();
  await expect(page).toHaveURL(/\?kind=city/);

  const pageLinks = page.locator('[data-atlas-page-link]');
  await expect(pageLinks.first()).toBeVisible();

  const nextButton = page.locator('[data-atlas-page-control="next"]');
  const nextDisabled = await nextButton.getAttribute('aria-disabled');

  if (nextDisabled !== 'true') {
    await nextButton.click();
    await expect(page).toHaveURL(/(\?|&)page=2/);
  }

  await expect(page.locator('.right-column.desktop-tools-column')).toHaveCount(0);
  await expect(page.locator('.tablet-tools')).toHaveCount(0);
});

test('tablet and mobile render atlas list in single-column responsive mode', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'Tablet/mobile only');

  await gotoAtlas(page, '/en/atlas/?kind=all');

  const grid = page.locator('[data-atlas-results-grid]');
  const gridStyles = await grid.evaluate((node) => {
    const cs = window.getComputedStyle(node as HTMLElement);
    return {
      display: cs.display,
      columns: cs.gridTemplateColumns,
    };
  });

  if (gridStyles.display !== 'none') {
    const normalized = gridStyles.columns.trim().split(/\s+/).filter(Boolean);
    expect(normalized.length).toBe(1);
  }

  await expect(page.locator('[data-atlas-results-top] [data-atlas-item]').first()).toBeVisible();
});

test('language_state badges are visible and use truncation styles', async ({ page }) => {
  await gotoAtlas(page, '/en/atlas/');

  const badgeText = page.locator('[data-atlas-item] .atlas-state-badge .truncate').first();
  await expect(badgeText).toBeVisible();

  const truncation = await badgeText.evaluate((node) => {
    const cs = window.getComputedStyle(node as HTMLElement);
    return {
      overflow: cs.overflow,
      textOverflow: cs.textOverflow,
      whiteSpace: cs.whiteSpace,
    };
  });

  expect(truncation.overflow).toBe('hidden');
  expect(truncation.textOverflow).toBe('ellipsis');
  expect(truncation.whiteSpace).toBe('nowrap');
});
