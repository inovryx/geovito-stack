import { expect, test } from '@playwright/test';

const clearConsent = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    localStorage.removeItem('consent.v1');
  });
};

const getEvents = async (page: import('@playwright/test').Page) =>
  page.evaluate(() => (Array.isArray(window.__gvEvents) ? window.__gvEvents : []));

test('first visit shows banner with deny-by-default document flags', async ({ page }) => {
  await clearConsent(page);
  await page.goto('/en/');

  await expect(page.locator('[data-consent-banner]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-consent-analytics', '0');
  await expect(page.locator('html')).toHaveAttribute('data-consent-ads', '0');
});

test('learn more in consent banner navigates to cookies page', async ({ page }) => {
  await clearConsent(page);
  await page.goto('/en/');

  await page.locator('[data-consent-banner] .consent-inline-link').click();
  await expect(page).toHaveURL(/\/en\/cookies\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /Cookie Policy/i })).toBeVisible();
});

test('accept all saves consent and enables analytics+ads flags', async ({ page }) => {
  await clearConsent(page);
  await page.goto('/en/');

  await page.locator('[data-consent-accept]').click();

  await expect(page.locator('[data-consent-banner]')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-consent-analytics', '1');
  await expect(page.locator('html')).toHaveAttribute('data-consent-ads', '1');

  const stored = await page.evaluate(() => localStorage.getItem('consent.v1'));
  expect(stored).toBeTruthy();
});

test('reject all keeps analytics+ads disabled', async ({ page }) => {
  await clearConsent(page);
  await page.goto('/en/');

  await page.locator('[data-consent-reject]').click();

  await expect(page.locator('[data-consent-banner]')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-consent-analytics', '0');
  await expect(page.locator('html')).toHaveAttribute('data-consent-ads', '0');
});

test('customize modal updates category flags and supports footer manage entry', async ({ page }) => {
  await clearConsent(page);
  await page.goto('/en/');

  await page.locator('[data-consent-customize]').click();
  await expect(page.locator('[data-consent-modal]')).toBeVisible();
  await expect(page.locator('[data-consent-toggle="analytics"]')).not.toBeChecked();
  await expect(page.locator('[data-consent-toggle="ads"]')).not.toBeChecked();

  await page.locator('[data-consent-toggle="analytics"]').check();
  await page.locator('[data-consent-toggle="ads"]').uncheck();
  await page.locator('[data-consent-save]').click();

  await expect(page.locator('[data-consent-modal]')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-consent-analytics', '1');
  await expect(page.locator('html')).toHaveAttribute('data-consent-ads', '0');

  await page.locator('[data-consent-manage]').first().click();
  await expect(page.locator('[data-consent-modal]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-consent-modal]')).toBeHidden();
});

test('cookies page query param opens consent modal and ESC returns focus to opener', async ({ page }) => {
  await clearConsent(page);
  await page.goto('/en/cookies/?consent=1');

  const modal = page.locator('[data-consent-modal]');
  const opener = page.locator('[data-consent-auto-opener]');

  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(opener).toBeFocused();
});

test('analytics events are blocked without consent and allowed after opt-in', async ({ page }) => {
  await clearConsent(page);
  await page.goto('/en/atlas/');
  await expect(page.locator('[data-atlas-skeleton]')).toBeHidden();

  await page.locator('form[data-search-location="header"] input[name="q"]').fill('rome');
  await page.evaluate(() => {
    const form = document.querySelector('form[data-search-location="header"]');
    if (!(form instanceof HTMLFormElement)) return;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  const beforeConsentEvents = await getEvents(page);
  const blockedSearch = beforeConsentEvents.filter((entry) => entry.event === 'search_submit');
  expect(blockedSearch).toHaveLength(0);

  await page.locator('[data-consent-customize]').click();
  await page.locator('[data-consent-toggle="analytics"]').check();
  await page.locator('[data-consent-toggle="ads"]').uncheck();
  await page.locator('[data-consent-save]').click();

  await page.locator('form[data-search-location="header"] input[name="q"]').fill('berlin');
  await page.evaluate(() => {
    const form = document.querySelector('form[data-search-location="header"]');
    if (!(form instanceof HTMLFormElement)) return;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  await expect.poll(async () => {
    const events = await getEvents(page);
    return events.some((entry) => entry.event === 'search_submit' && entry.props?.query === 'berlin');
  }).toBeTruthy();
});

test('ads provider script is gated by ads consent', async ({ page }) => {
  await clearConsent(page);
  await page.goto('/en/');

  await expect(page.locator('script[data-gv-ads-script]')).toHaveCount(0);

  await page.locator('[data-consent-accept]').click();
  await expect(page.locator('script[data-gv-ads-script]')).toHaveCount(1);
});
