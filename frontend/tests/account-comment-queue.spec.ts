import { expect, test } from '@playwright/test';

const MOCK_JWT = 'mock-jwt-token';

test('account shows my comment queue and refresh updates counts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run queue smoke once on desktop');

  let queueRequestCount = 0;
  let previewRequestCount = 0;
  const previewStates: string[] = [];

  await page.route(/\/api\/users\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 42,
        username: 'olmysweet',
        email: 'ali.koc.00@gmail.com',
        confirmed: true,
        blocked: false,
        createdAt: '2026-02-01T10:20:00.000Z',
      }),
    });
  });

  await page.route(/\/api\/user-preferences\/me$/, async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { preferred_ui_language: 'en' } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { preferred_ui_language: 'en' } }),
    });
  });

  await page.route(/\/api\/blog-comments\/me\/list/, async (route) => {
    queueRequestCount += 1;
    const payload =
      queueRequestCount === 1
        ? {
            data: [
              {
                comment_id: 'comment-1',
                body: 'First pending comment',
                language: 'en',
                source: 'registered',
                status: 'pending',
                blog_post_ref: 'post-europe-city-breaks',
                moderation_notes: null,
                created_at: '2026-02-19T18:00:00.000Z',
                updated_at: '2026-02-19T18:00:00.000Z',
              },
            ],
            meta: {
              limit: 30,
              status: 'all',
              counts: {
                pending: 1,
                approved: 0,
                rejected: 0,
                spam: 0,
                deleted: 0,
              },
            },
          }
        : {
            data: [
              {
                comment_id: 'comment-1',
                body: 'First pending comment',
                language: 'en',
                source: 'registered',
                status: 'approved',
                blog_post_ref: 'post-europe-city-breaks',
                moderation_notes: 'Approved by moderator',
                created_at: '2026-02-19T18:00:00.000Z',
                updated_at: '2026-02-19T18:04:00.000Z',
              },
            ],
            meta: {
              limit: 30,
              status: 'all',
              counts: {
                pending: 0,
                approved: 1,
                rejected: 0,
                spam: 0,
                deleted: 0,
              },
            },
          };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  await page.route(/\/api\/ui-locales\/meta\/progress/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          summary: {
            locales_total: 3,
            reference_locale: 'en',
            locales_complete: 1,
            locales_with_missing: 1,
            locales_with_untranslated: 1,
            deploy_required_count: 1,
          },
          locales: [
            {
              ui_locale: 'en',
              status: 'complete',
              reference_locale: 'en',
              deploy_required: false,
              total_keys: 200,
              translated_keys: 200,
              missing_keys: 0,
              untranslated_keys: 0,
              coverage_percent: 100,
            },
            {
              ui_locale: 'tr',
              status: 'draft',
              reference_locale: 'en',
              deploy_required: true,
              total_keys: 200,
              translated_keys: 188,
              missing_keys: 8,
              untranslated_keys: 4,
              coverage_percent: 94,
            },
            {
              ui_locale: 'de',
              status: 'draft',
              reference_locale: 'en',
              deploy_required: false,
              total_keys: 200,
              translated_keys: 200,
              missing_keys: 0,
              untranslated_keys: 0,
              coverage_percent: 100,
            },
          ],
        },
      }),
    });
  });

  await page.route(/\/api\/ui-locales\/meta\/tr\/reference-preview/, async (route) => {
    previewRequestCount += 1;
    const requestUrl = new URL(route.request().url());
    const requestedState = requestUrl.searchParams.get('state') || 'all';
    previewStates.push(requestedState);
    const rowsByState = {
      all: [
        {
          key: 'nav.home',
          state: 'missing',
          reference_value: 'Home',
          locale_value: null,
        },
        {
          key: 'nav.blog',
          state: 'untranslated',
          reference_value: 'Blog',
          locale_value: 'Blog',
        },
      ],
      missing: [
        {
          key: 'nav.home',
          state: 'missing',
          reference_value: 'Home',
          locale_value: null,
        },
      ],
      untranslated: [
        {
          key: 'nav.blog',
          state: 'untranslated',
          reference_value: 'Blog',
          locale_value: 'Blog',
        },
      ],
    } as const;

    const rows =
      requestedState === 'missing' || requestedState === 'untranslated'
        ? rowsByState[requestedState]
        : rowsByState.all;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          ui_locale: 'tr',
          reference_locale: 'en',
          filters: { state: requestedState },
          pagination: { offset: 0, limit: 12, total: rows.length, returned: rows.length },
          rows,
        },
      }),
    });
  });

  await page.addInitScript(([jwt]) => {
    const payload = {
      jwt,
      username: 'olmysweet',
      email: 'ali.koc.00@gmail.com',
      confirmed: true,
      blocked: false,
      loginAt: '2026-02-19T18:00:00.000Z',
    };
    localStorage.setItem('geovito_auth_session', JSON.stringify(payload));
  }, [MOCK_JWT]);

  await page.goto('/en/account/');

  await expect(page.locator('[data-account-comments]')).toBeVisible();
  await expect(page.locator('[data-account-comments-pending]')).toHaveText('1');
  await expect(page.locator('[data-account-comments-approved]')).toHaveText('0');
  await expect(page.locator('[data-account-comments-list] .account-comment-item')).toHaveCount(1);
  await expect(page.locator('[data-account-comments-list] .account-comment-item')).toContainText('post-europe-city-breaks');
  await expect(page.locator('[data-account-comments-list] .account-comment-item')).toContainText('pending');

  await page.click('[data-account-comments-refresh]');
  await expect.poll(() => queueRequestCount).toBeGreaterThanOrEqual(2);

  await expect(page.locator('[data-account-comments-pending]')).toHaveText('0');
  await expect(page.locator('[data-account-comments-approved]')).toHaveText('1');
  await expect(page.locator('[data-account-comments-list] .account-comment-item')).toContainText('approved');
  await expect(page.locator('[data-account-comments-list] .account-comment-item')).toContainText('Approved by moderator');

  await expect(page.locator('[data-account-language-select] option[value="tr"]')).toHaveText('TR · 12');
  await page.selectOption('[data-account-language-select]', 'tr');
  await expect(page.locator('[data-account-language-health]')).toContainText('12');
  await expect(page.locator('[data-account-locale-progress-active-filter]')).toContainText('All');
  await expect(page.locator('[data-account-locale-progress-filtered-total]')).toHaveText('12');
  await page.selectOption('[data-account-locale-progress-filter]', 'missing');
  await expect(page.locator('[data-account-locale-progress-active-filter]')).toContainText('Missing only');
  await expect(page.locator('[data-account-locale-progress-filtered-total]')).toHaveText('8');

  await page.click('[data-account-locale-preview-toggle][data-locale-code="tr"]');
  await expect.poll(() => previewRequestCount).toBeGreaterThanOrEqual(1);
  await expect(page.locator('[data-account-locale-preview="tr"]')).toContainText('nav.home');
  await expect(page.locator('[data-account-locale-preview="tr"]')).toContainText('missing');
  await expect(page.locator('[data-account-locale-preview="tr"]')).not.toContainText('nav.blog');

  await page.click('[data-account-locale-preview-export][data-locale-code="tr"]');
  await expect.poll(() => previewRequestCount).toBeGreaterThanOrEqual(2);
  await expect.poll(() => previewStates.filter((state) => state === 'missing').length).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-account-locale-progress-feedback]')).toContainText('CSV exported for TR');
});
