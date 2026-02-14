import { expect, test } from '@playwright/test';

const GTM_LOAD_BEFORE_BASE_URL = 'http://localhost:4326';

const clearConsent = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    localStorage.removeItem('consent.v1');
  });
};

const readDataLayer = async (page: import('@playwright/test').Page) =>
  page.evaluate(() => (Array.isArray(window.dataLayer) ? window.dataLayer : []));

const extractConsentCalls = (entries: unknown[]) => {
  return entries.filter((entry) => {
    return Array.isArray(entry) && entry[0] === 'consent' && (entry[1] === 'default' || entry[1] === 'update');
  }) as Array<[string, 'default' | 'update', Record<string, string>]>;
};

test('strict mode keeps GTM blocked before consent with default deny flags', async ({ page }) => {
  await clearConsent(page);
  await page.goto('/en/');

  await expect(page.locator('html')).toHaveAttribute('data-consent-analytics', '0');
  await expect(page.locator('html')).toHaveAttribute('data-consent-ads', '0');
  await expect(page.locator('script[data-gv-gtm-script="1"]')).toHaveCount(0);
});

test('accept all injects GTM and pushes consent update', async ({ page }) => {
  await clearConsent(page);
  await page.goto('/en/');

  await page.locator('[data-consent-accept]').click();

  await expect(page.locator('script[data-gv-gtm-script="1"]')).toHaveCount(1);

  await expect.poll(async () => {
    const entries = await readDataLayer(page);
    const consentCalls = extractConsentCalls(entries);
    return consentCalls.some(
      (call) =>
        call[1] === 'update' &&
        call[2]?.analytics_storage === 'granted' &&
        call[2]?.ad_storage === 'granted' &&
        call[2]?.ad_user_data === 'granted' &&
        call[2]?.ad_personalization === 'granted'
    );
  }).toBeTruthy();
});

test('reject all keeps GTM blocked in strict mode', async ({ page }) => {
  await clearConsent(page);
  await page.goto('/en/');

  await page.locator('[data-consent-reject]').click();

  await expect(page.locator('script[data-gv-gtm-script="1"]')).toHaveCount(0);
});

test('analytics events map to dataLayer payload after analytics consent', async ({ page }) => {
  await clearConsent(page);
  await page.goto('/en/');

  await page.locator('[data-consent-customize]').click();
  await page.locator('[data-consent-toggle="analytics"]').check();
  await page.locator('[data-consent-toggle="ads"]').uncheck();
  await page.locator('[data-consent-save]').click();

  await page.evaluate(() => {
    window.__gvTrack?.('search_submit', {
      query: 'rome',
      type: 'all',
      location: 'header',
      lang: 'en',
    });
  });

  await expect.poll(async () => {
    const entries = await readDataLayer(page);
    return entries.some(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        !Array.isArray(entry) &&
        (entry as { event?: string }).event === 'search_submit' &&
        (entry as { query?: string }).query === 'rome' &&
        (entry as { lang?: string }).lang === 'en'
    );
  }).toBeTruthy();
});

test('load-before-consent mode injects GTM early but still defaults to denied consent', async ({ page }) => {
  await clearConsent(page);
  await page.goto(`${GTM_LOAD_BEFORE_BASE_URL}/en/`);

  await expect(page.locator('script[data-gv-gtm-script="1"]')).toHaveCount(1);

  const entries = await readDataLayer(page);
  const consentCalls = extractConsentCalls(entries);

  expect(consentCalls.length).toBeGreaterThan(0);
  expect(consentCalls[0]?.[1]).toBe('default');
  expect(consentCalls[0]?.[2]?.analytics_storage).toBe('denied');
  expect(consentCalls[0]?.[2]?.ad_storage).toBe('denied');
  expect(consentCalls[0]?.[2]?.ad_user_data).toBe('denied');
  expect(consentCalls[0]?.[2]?.ad_personalization).toBe('denied');
});
