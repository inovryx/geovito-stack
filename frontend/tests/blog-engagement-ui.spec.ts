import { expect, test } from '@playwright/test';

const BLOG_LIST_PATH = '/en/blog/';

async function resolveBlogDetailPath(page: import('@playwright/test').Page): Promise<string | null> {
  await page.goto(BLOG_LIST_PATH);
  const hrefs = await page
    .locator('a[href^="/en/blog/"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') || '').filter(Boolean));
  return hrefs.find((href) => /^\/en\/blog\/.+\/?$/.test(href) && href !== '/en/blog/') || null;
}

test('guest blog engagement shows login CTA for like and blocks empty-email comment', async ({ page }) => {
  const blogPath = await resolveBlogDetailPath(page);
  test.skip(!blogPath, 'No blog detail pages available in current dataset.');

  let likeToggleCalls = 0;
  let commentSubmitCalls = 0;

  await page.route(/\/api\/blog-likes\/count\//, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { like_count: 0 } }),
    });
  });

  await page.route(/\/api\/blog-comments\/count\//, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { approved_count: 0 } }),
    });
  });

  await page.route(/\/api\/blog-comments\?post_id=/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route(/\/api\/blog-likes\/toggle$/, async (route) => {
    likeToggleCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ liked: true, like_count: 1 }),
    });
  });

  await page.route(/\/api\/blog-comments\/submit$/, async (route) => {
    commentSubmitCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ moderation_status: 'pending' }),
    });
  });

  await page.goto(blogPath!);

  await expect(page.locator('[data-comment-mode-note]')).toContainText('Guest mode');

  await page.click('[data-like-toggle]');
  await expect(page.locator('[data-like-feedback]')).toContainText('Please login to like this post.');
  await expect(page.locator('[data-like-login-link]')).toBeVisible();
  await expect(page.locator('[data-like-login-link]')).toHaveAttribute('href', '/en/login/');
  await expect.poll(() => likeToggleCalls).toBe(0);
  await expect(page).toHaveURL(/\/en\/blog\/.+\/?$/);

  await page.fill('[data-comment-form] textarea[name="body"]', 'guest comment without email');
  await page.click('[data-comment-submit]');
  await expect(page.locator('[data-comment-feedback]')).toContainText('Please enter email.');
  await expect.poll(() => commentSubmitCalls).toBe(0);
});

test('authenticated blog engagement hides guest fields and submits without email', async ({ page }) => {
  const blogPath = await resolveBlogDetailPath(page);
  test.skip(!blogPath, 'No blog detail pages available in current dataset.');

  let likeToggleCalls = 0;
  let commentSubmitCalls = 0;

  await page.route(/\/api\/blog-likes\/count\//, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { like_count: 0 } }),
    });
  });

  await page.route(/\/api\/blog-comments\/count\//, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { approved_count: 0 } }),
    });
  });

  await page.route(/\/api\/blog-comments\?post_id=/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route(/\/api\/blog-likes\/toggle$/, async (route) => {
    likeToggleCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ liked: true, like_count: 1 }),
    });
  });

  await page.route(/\/api\/blog-comments\/submit$/, async (route) => {
    commentSubmitCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ moderation_status: 'pending' }),
    });
  });

  await page.addInitScript(([jwt]) => {
    localStorage.setItem(
      'geovito_auth_session',
      JSON.stringify({
        jwt,
        username: 'olmysweet',
        email: 'ali.koc.00@gmail.com',
      })
    );
  }, ['mock-jwt-token']);

  await page.goto(blogPath!);

  await expect(page.locator('[data-comment-mode-note]')).toContainText('Logged in as olmysweet');
  await expect(page.locator('[data-comment-email-wrap]')).toBeHidden();
  await expect(page.locator('[data-like-login-link]')).toBeHidden();

  await page.click('[data-like-toggle]');
  await expect.poll(() => likeToggleCalls).toBeGreaterThanOrEqual(1);
  await expect(page.locator('[data-like-count]')).toHaveText('1');
  await expect(page.locator('[data-like-toggle] .ui-button-label')).toHaveText('Unlike');

  await page.fill('[data-comment-form] textarea[name="body"]', 'registered comment');
  await page.click('[data-comment-submit]');
  await expect.poll(() => commentSubmitCalls).toBeGreaterThanOrEqual(1);
  await expect(page.locator('[data-comment-feedback]')).toContainText('pending moderation');
});
