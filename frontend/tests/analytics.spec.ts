import { expect, test } from '@playwright/test';

const getEvents = async (page: import('@playwright/test').Page) => {
  return page.evaluate(() => {
    return Array.isArray(window.__gvEvents) ? window.__gvEvents : [];
  });
};

const setConsent = async (page: import('@playwright/test').Page, analytics: boolean, ads = false) => {
  await page.addInitScript(
    ({ allowAnalytics, allowAds }) => {
      localStorage.setItem(
        'consent.v1',
        JSON.stringify({
          v: 1,
          ts: Date.now(),
          necessary: true,
          analytics: allowAnalytics,
          ads: allowAds,
        })
      );
    },
    { allowAnalytics: analytics, allowAds: ads }
  );
};

test('analytics pipeline emits search/chip/pagination/theme/sidebar events', async ({ page }) => {
  await setConsent(page, true, false);
  await page.goto('/en/atlas/');
  await expect(page.locator('[data-atlas-skeleton]')).toBeHidden();

  await page.locator('[data-theme-toggle]').first().click();
  await page.locator('[data-sidebar-toggle]').first().click();

  await page.locator('form[data-search-location="header"] input[name="q"]').fill('rome');
  await page.evaluate(() => {
    const form = document.querySelector('form[data-search-location="header"]');
    if (!(form instanceof HTMLFormElement)) return;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  await page.locator('[data-atlas-chip][data-kind="city"]').click();
  await page.locator('[data-atlas-page-link]').first().click();

  await expect.poll(async () => {
    const events = await getEvents(page);

    const hasSearch = events.some(
      (entry) =>
        entry.event === 'search_submit' &&
        entry.props?.query === 'rome' &&
        entry.props?.location === 'header' &&
        entry.props?.lang === 'en'
    );
    const hasChip = events.some(
      (entry) =>
        entry.event === 'filter_chip_click' &&
        entry.props?.group === 'atlas' &&
        entry.props?.value === 'city' &&
        entry.props?.lang === 'en'
    );
    const hasPagination = events.some(
      (entry) =>
        entry.event === 'pagination_click' &&
        entry.props?.context === 'atlas' &&
        entry.props?.action === 'page' &&
        entry.props?.lang === 'en'
    );
    const hasThemeToggle = events.some(
      (entry) =>
        entry.event === 'theme_toggle' &&
        (entry.props?.to === 'light' || entry.props?.to === 'dark')
    );
    const hasSidebarToggle = events.some(
      (entry) =>
        entry.event === 'sidebar_toggle' &&
        (entry.props?.to === 'expanded' || entry.props?.to === 'compact')
    );

    return hasSearch && hasChip && hasPagination && hasThemeToggle && hasSidebarToggle;
  }).toBeTruthy();
});

test('ugc/content area cannot trigger analytics even with injected data-ev attributes', async ({ page }) => {
  await setConsent(page, true, false);
  await page.goto('/en/blog/reading-city-through-district-layers/');
  await expect(page.locator('article[data-ev-root="off"]')).toBeVisible();

  const before = await getEvents(page);

  await page.evaluate(() => {
    const host = document.querySelector('article[data-ev-root="off"]');
    if (!(host instanceof HTMLElement)) return;

    const link = document.createElement('a');
    link.id = 'ugc-analytics-probe';
    link.href = '#ugc-analytics-probe';
    link.textContent = 'ugc probe';
    link.setAttribute('data-ev', 'nav_click');
    link.setAttribute('data-ev-scope', 'ui');
    link.setAttribute('data-ev-item', 'ugc-nav');
    host.appendChild(link);
  });

  await page.locator('#ugc-analytics-probe').click();

  const after = await getEvents(page);
  const ugcEvents = after.filter((entry) => entry.event === 'nav_click' && entry.props?.item === 'ugc-nav');
  expect(ugcEvents).toHaveLength(0);
  expect(after.length).toBe(before.length);
});

test('analytics whitelist strips unsafe props and redacts pii-like strings', async ({ page }) => {
  await setConsent(page, true, false);
  await page.goto('/en/atlas/');
  await expect(page.locator('[data-atlas-skeleton]')).toBeHidden();

  await page.evaluate(() => {
    window.__gvTrack?.('nav_click', {
      item: 'home',
      lang: 'en',
      email: 'user@example.com',
      token: 'secret-token',
      address: 'test lane',
      extra: 'blocked',
    });
    window.__gvTrack?.('search_submit', {
      query: 'hello\\nuser@example.com +1 (555) 123-4567',
      type: 'all',
      location: 'header',
      lang: 'en',
      session: 'secret-session',
    });
    window.__gvTrack?.('unknown_event', { foo: 'bar' });
  });

  const events = await getEvents(page);
  const navEvent = events.find((entry) => entry.event === 'nav_click' && entry.props?.item === 'home');
  const searchEvent = events.find((entry) => entry.event === 'search_submit');
  const unknownEvent = events.find((entry) => entry.event === 'unknown_event');

  expect(navEvent).toBeTruthy();
  expect(navEvent?.props).toEqual({
    item: 'home',
    lang: 'en',
  });

  expect(searchEvent).toBeTruthy();
  expect(typeof searchEvent?.props?.query).toBe('string');
  expect(String(searchEvent?.props?.query)).not.toContain('@');
  expect(String(searchEvent?.props?.query)).not.toMatch(/\+?\d[\d().\-\s]{7,}\d/);
  expect(searchEvent?.props).not.toHaveProperty('session');
  expect(unknownEvent).toBeUndefined();
});

test('rapid repeated chip clicks are deduped', async ({ page }) => {
  await setConsent(page, true, false);
  await page.goto('/en/atlas/');
  await expect(page.locator('[data-atlas-skeleton]')).toBeHidden();

  const before = (await getEvents(page)).filter(
    (entry) => entry.event === 'filter_chip_click' && entry.props?.value === 'city'
  ).length;

  await page.evaluate(() => {
    const chip = document.querySelector('[data-atlas-chip][data-kind="city"]');
    if (!(chip instanceof HTMLElement)) return;
    chip.click();
    chip.click();
  });

  await expect.poll(async () => {
    const after = (await getEvents(page)).filter(
      (entry) => entry.event === 'filter_chip_click' && entry.props?.value === 'city'
    ).length;
    return after - before;
  }).toBe(1);
});
