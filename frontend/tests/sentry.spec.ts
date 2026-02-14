import { expect, test } from '@playwright/test';

const clearConsent = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    localStorage.removeItem('consent.v1');
  });
};

const setConsent = async (page: import('@playwright/test').Page, analytics: boolean, ads = false) => {
  await page.addInitScript(
    ({ analyticsAllowed, adsAllowed }) => {
      localStorage.setItem(
        'consent.v1',
        JSON.stringify({
          v: 2,
          ts: Date.now(),
          necessary: true,
          analytics: analyticsAllowed,
          ads: adsAllowed,
          source: 'user',
        })
      );
    },
    { analyticsAllowed: analytics, adsAllowed: ads }
  );
};

const getSentryEvents = async (page: import('@playwright/test').Page) =>
  page.evaluate(() => (Array.isArray(window.__gvSentryEvents) ? window.__gvSentryEvents : []));

test('default deny consent does not capture window errors', async ({ page }) => {
  await clearConsent(page);
  await page.goto('/en/');

  await page.evaluate(() => {
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'deny-mode-error',
        error: new Error('deny-mode-error'),
      })
    );
  });

  await expect
    .poll(async () => {
      const events = await getSentryEvents(page);
      return events.length;
    })
    .toBe(0);
});

test('analytics consent allows error capture', async ({ page }) => {
  await setConsent(page, true, false);
  await page.goto('/en/');

  await page.evaluate(() => {
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'consented-window-error',
        error: new Error('consented-window-error'),
      })
    );
  });

  await expect
    .poll(async () => {
      const events = await getSentryEvents(page);
      return events.length;
    })
    .toBeGreaterThan(0);
});

test('captured event URL strips querystring and hash', async ({ page }) => {
  await setConsent(page, true, false);
  await page.goto('/en/error/?consent=1&utm_source=test#debug');

  await page.evaluate(() => {
    window.__gvCaptureException?.(new Error('url-sanitization-check'), {
      request: {
        url: `${window.location.origin}${window.location.pathname}?email=user@example.com#private`,
      },
    });
  });

  await expect
    .poll(async () => {
      const events = await getSentryEvents(page);
      const latest = events[events.length - 1] as { request?: { url?: string } } | undefined;
      return latest?.request?.url || '';
    })
    .toContain('/en/error/');

  const events = await getSentryEvents(page);
  const latest = events[events.length - 1] as { request?: { url?: string } } | undefined;
  const url = latest?.request?.url || '';

  expect(url).not.toContain('?');
  expect(url).not.toContain('#');
});

test('captured error message redacts pii patterns', async ({ page }) => {
  await setConsent(page, true, false);
  await page.goto('/en/');

  await page.evaluate(() => {
    window.__gvCaptureException?.(new Error('PII probe user@example.com +1 (555) 123-4567'));
  });

  await expect
    .poll(async () => {
      const events = await getSentryEvents(page);
      const latest = events[events.length - 1] as { message?: string; exception?: { values?: Array<{ value?: string }> } } | undefined;
      return latest?.message || latest?.exception?.values?.[0]?.value || '';
    })
    .not.toContain('@');

  const events = await getSentryEvents(page);
  const latest = events[events.length - 1] as { message?: string; exception?: { values?: Array<{ value?: string }> } } | undefined;
  const message = latest?.message || latest?.exception?.values?.[0]?.value || '';

  expect(message).toContain('[redacted-email]');
  expect(message).toContain('[redacted-phone]');
});

