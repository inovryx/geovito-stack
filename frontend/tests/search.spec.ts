import { expect, test } from '@playwright/test';

const waitForSearchReady = async (page: import('@playwright/test').Page, path = '/en/search/') => {
  await page.goto(path);
  await expect(page.locator('[data-search-skeleton]')).toBeHidden();
  await expect(page.locator('[data-search-results]')).toBeVisible();
};

const buildPartialToken = (title: string) => {
  const cleaned = String(title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .trim();
  const words = cleaned.split(/\s+/).filter((word) => word.length >= 3);
  if (words.length > 0) {
    const longest = words.sort((a, b) => b.length - a.length)[0];
    return longest.slice(0, Math.min(4, longest.length));
  }
  return cleaned.slice(0, Math.min(4, cleaned.length));
};

test('search keeps item discoverable with partial keyword query', async ({ page }) => {
  await waitForSearchReady(page);

  const firstTitle = page.locator('[data-search-result-title]').first();
  await expect(firstTitle).toBeVisible();

  const href = await firstTitle.getAttribute('href');
  const title = (await firstTitle.textContent()) || '';
  expect(href).toBeTruthy();

  const token = buildPartialToken(title);
  expect(token.length).toBeGreaterThanOrEqual(2);

  await waitForSearchReady(page, `/en/search/?q=${encodeURIComponent(token)}`);
  await expect(page.locator(`[data-search-result-title][href="${href}"]`).first()).toBeVisible();
});

test('search supports country alias query (ABD -> United States)', async ({ page }) => {
  await waitForSearchReady(page);

  const usLink = page.locator('[data-search-result-title][href*="/atlas/united-states/"]');
  await expect(usLink.first()).toBeVisible();

  await waitForSearchReady(page, '/en/search/?q=abd');
  await expect(page.locator('[data-search-result-title][href*="/atlas/united-states/"]').first()).toBeVisible();
});

test('search returns New York City for prefix query "york"', async ({ page }) => {
  await waitForSearchReady(page);

  const nycLink = page.locator('[data-search-result-title][href*="/atlas/new-york-city/"]');
  await expect(nycLink.first()).toBeVisible();

  await waitForSearchReady(page, '/en/search/?q=york');
  await expect(page.locator('[data-search-result-title][href*="/atlas/new-york-city/"]').first()).toBeVisible();
});

test('search tolerates one-character typo for Berlin', async ({ page }) => {
  await waitForSearchReady(page);

  const berlinLink = page.locator('[data-search-result-title][href*="/atlas/berlin/"]');
  await expect(berlinLink.first()).toBeVisible();

  await waitForSearchReady(page, '/en/search/?q=berln');
  await expect(page.locator('[data-search-result-title][href*="/atlas/berlin/"]').first()).toBeVisible();
});
