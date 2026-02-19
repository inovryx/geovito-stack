import { expect, test } from '@playwright/test';

const MOCK_JWT = 'mock-jwt-token';

test('account shows my comment queue and refresh updates counts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run queue smoke once on desktop');

  let queueRequestCount = 0;

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
  await expect(page.locator('.account-comment-item')).toHaveCount(1);
  await expect(page.locator('.account-comment-item')).toContainText('post-europe-city-breaks');
  await expect(page.locator('.account-comment-item')).toContainText('pending');

  await page.click('[data-account-comments-refresh]');
  await expect.poll(() => queueRequestCount).toBeGreaterThanOrEqual(2);

  await expect(page.locator('[data-account-comments-pending]')).toHaveText('0');
  await expect(page.locator('[data-account-comments-approved]')).toHaveText('1');
  await expect(page.locator('.account-comment-item')).toContainText('approved');
  await expect(page.locator('.account-comment-item')).toContainText('Approved by moderator');
});
