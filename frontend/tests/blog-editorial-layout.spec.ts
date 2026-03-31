import { expect, test } from '@playwright/test';

const BLOG_LIST_PATH = '/en/blog/';

const gotoBlogListing = async (page: import('@playwright/test').Page) => {
  await page.goto(BLOG_LIST_PATH);
  await expect(page.locator('[data-blog-listing-intro]')).toBeVisible();
};

const resolveBlogDetailPath = async (page: import('@playwright/test').Page): Promise<string | null> => {
  const hrefs = await page
    .locator('[data-blog-listing-title]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') || '').filter(Boolean));
  return hrefs.find((href) => /^\/en\/blog\/.+\/?$/.test(href) && href !== '/en/blog/') || null;
};

test('blog listing/detail editorial surface desktop ve tools gizli kalir', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop-only scenario');

  await gotoBlogListing(page);

  await expect(page.locator('body')).toHaveAttribute('data-page-surface', 'blog-listing');
  await expect(page.locator('.right-column.desktop-tools-column')).toHaveCount(0);
  await expect(page.locator('.tablet-tools')).toHaveCount(0);

  const detailPath = await resolveBlogDetailPath(page);
  expect(detailPath).toBeTruthy();

  await page.goto(String(detailPath));
  await expect(page.locator('body')).toHaveAttribute('data-page-surface', 'blog-detail');
  await expect(page.locator('[data-blog-detail-hero]')).toBeVisible();
  await expect(page.locator('[data-blog-detail-reading]')).toBeVisible();
  await expect(page.locator('[data-blog-detail-reading]')).toHaveClass(/content-wrap-reading/);
  await expect(page.locator('[data-blog-engagement]')).toBeVisible();
  await expect(page.locator('.right-column.desktop-tools-column')).toHaveCount(0);
  await expect(page.locator('.tablet-tools')).toHaveCount(0);
});

test('blog listing grid mobile/tablet kolon hedefini korur', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'Tablet/mobile only');

  await gotoBlogListing(page);

  const grid = page.locator('[data-blog-listing-grid]');
  if ((await grid.count()) === 0) {
    await expect(page.locator('[data-blog-listing-empty]')).toBeVisible();
    return;
  }

  const gridStyles = await grid.evaluate((node) => {
    const cs = window.getComputedStyle(node as HTMLElement);
    return {
      display: cs.display,
      columns: cs.gridTemplateColumns,
    };
  });

  if (gridStyles.display !== 'none') {
    const normalized = gridStyles.columns.trim().split(/\s+/).filter(Boolean);
    const expectedColumns = testInfo.project.name === 'tablet' ? 2 : 1;
    expect(normalized.length).toBe(expectedColumns);
  }
});

test('blog detail mobile/tablet okuma alaninda yatay tasma olusmaz', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'Tablet/mobile only');

  await gotoBlogListing(page);
  const detailPath = await resolveBlogDetailPath(page);
  expect(detailPath).toBeTruthy();

  await page.goto(String(detailPath));
  await expect(page.locator('[data-blog-detail-reading]')).toBeVisible();

  const hasOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });

  expect(hasOverflow).toBeFalsy();
});
