import { expect, test } from '@playwright/test';

const seedConsent = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'consent.v1',
      JSON.stringify({
        v: 2,
        ts: Date.now(),
        necessary: true,
        analytics: false,
        ads: false,
        source: 'user',
      })
    );
  });
};

test('legal pages render title and last updated metadata', async ({ page }) => {
  await seedConsent(page);

  const pages = [
    { path: '/en/privacy/', title: 'Privacy Policy' },
    { path: '/en/cookies/', title: 'Cookie Policy' },
    { path: '/en/terms/', title: 'Terms of Use' },
  ] as const;

  for (const item of pages) {
    await page.goto(item.path);
    await expect(page.getByRole('heading', { level: 1, name: item.title })).toBeVisible();
    await expect(page.locator('.legal-last-updated')).toContainText('Last updated');
  }
});

test('home footer legal links are visible and navigate correctly', async ({ page }) => {
  await seedConsent(page);
  await page.goto('/en/');

  const privacyLink = page.locator('.site-footer-links a[href="/en/privacy/"]');
  const cookiesLink = page.locator('.site-footer-links a[href="/en/cookies/"]');
  const termsLink = page.locator('.site-footer-links a[href="/en/terms/"]');

  await expect(privacyLink).toBeVisible();
  await expect(cookiesLink).toBeVisible();
  await expect(termsLink).toBeVisible();

  await privacyLink.click();
  await expect(page).toHaveURL(/\/en\/privacy\/$/);

  await page.goto('/en/');
  await cookiesLink.click();
  await expect(page).toHaveURL(/\/en\/cookies\/$/);

  await page.goto('/en/');
  await termsLink.click();
  await expect(page).toHaveURL(/\/en\/terms\/$/);
});
