import { expect, test } from '@playwright/test';

const MOCK_JWT = 'dashboard-appearance-mock-jwt';

async function dismissConsentBanner(page: import('@playwright/test').Page): Promise<void> {
  const banner = page.locator('[data-consent-banner]');
  if ((await banner.count()) === 0) return;
  if (await banner.isVisible()) {
    await page.locator('[data-consent-reject]').click();
  }
  await expect(banner).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/users\/me\?populate=role$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 9,
        username: 'appearance-user',
        email: 'appearance-user@example.com',
        confirmed: true,
        blocked: false,
        createdAt: '2026-03-01T09:30:00.000Z',
        role: {
          type: 'authenticated',
          name: 'Authenticated',
        },
      }),
    });
  });

  await page.route(/\/api\/user-preferences\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          preferred_ui_language: 'en',
          notifications_site_enabled: true,
          notifications_email_enabled: true,
          notifications_digest: 'daily',
          onboarding_progress: {
            profile_completed: true,
            first_place_selected: false,
            first_post_started: false,
            share_prompt_seen: false,
            skipped: false,
            status: 'in_progress',
          },
        },
      }),
    });
  });

  await page.route(/\/api\/user-follows\/me\/list\?limit=500$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          follow_system_enabled: true,
          items: [],
        },
      }),
    });
  });

  await page.route(/\/api\/user-saved-lists\/me\/lists\?limit=200$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { items: [] } }),
    });
  });

  await page.route(/\/api\/user-saved-lists\/me\/items\?limit=500$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { items: [] } }),
    });
  });

  await page.route(/\/api\/blog-comments\/me\/list\?limit=30$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });

  await page.route(/\/api\/blog-comments\/moderation\/list\?status=all&limit=40$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });

  await page.route(/\/api\/content-reports\/moderation\/list\?limit=60$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });

  await page.route(/\/api\/account-requests\/moderation\/list\?limit=60$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });

  await page.route(/\/api\/ui-locales\/meta\/progress\?reference_locale=en$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          summary: {
            locales_total: 1,
            reference_locale: 'en',
            locales_complete: 1,
            locales_with_gaps: 0,
            locales_with_missing: 0,
            locales_with_untranslated: 0,
            deploy_required_count: 0,
          },
          locales: [],
        },
      }),
    });
  });

  await page.route(/\/api\/community-settings\/effective$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          ugc_enabled: true,
          ugc_open_mode: 'controlled',
          guest_comments_enabled: true,
          post_links_enabled: true,
          comments_links_enabled: true,
          post_link_limit: 4,
          member_comment_link_limit: 2,
          guest_comment_link_limit: 1,
          default_profile_visibility: 'public',
          moderation_strictness: 'balanced',
          citizen_card_visible: true,
          badges_visible: true,
          follow_system_enabled: true,
          notifications_defaults: null,
          safety_notice_templates: null,
        },
      }),
    });
  });

  await page.route(/\/\.well-known\/geovito-build\.json$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        build_sha7: 'appear42',
        build_sha_full: 'appear42deadbeef',
        build_branch: 'main',
        build_time_utc: '2026-03-01T09:31:00.000Z',
      }),
    });
  });

  await page.addInitScript(([jwt]) => {
    localStorage.setItem(
      'geovito_auth_session',
      JSON.stringify({
        jwt,
        username: 'appearance-session',
        email: 'appearance-user@example.com',
        confirmed: true,
        blocked: false,
        loginAt: '2026-03-01T09:32:00.000Z',
      })
    );
  }, [MOCK_JWT]);
});

test('dashboard appearance panel updates html dataset and persists preferences', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run appearance smoke once on desktop');

  await page.goto('/en/dashboard/');
  await dismissConsentBanner(page);

  await expect(page.locator('[data-testid="dashboard-appearance-panel"]')).toBeVisible();

  await page.locator('[data-testid="dashboard-appearance-mode-dark"]').check();
  await page.locator('[data-testid="dashboard-appearance-accent-emerald"]').check();
  await page.locator('[data-testid="dashboard-appearance-surface-glass"]').check();

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme-mode', 'dark');
  await expect(html).toHaveAttribute('data-theme-accent', 'emerald');
  await expect(html).toHaveAttribute('data-surface-style', 'glass');

  const stored = await page.evaluate(() => ({
    mode: localStorage.getItem('geovito_theme_mode'),
    legacyMode: localStorage.getItem('theme'),
    accent: localStorage.getItem('geovito_theme_accent'),
    surface: localStorage.getItem('geovito_surface_style'),
  }));

  expect(stored.mode).toBe('dark');
  expect(stored.legacyMode).toBe('dark');
  expect(stored.accent).toBe('emerald');
  expect(stored.surface).toBe('glass');

  await page.reload();
  await dismissConsentBanner(page);

  await expect(page.locator('[data-testid="dashboard-appearance-mode-dark"]')).toBeChecked();
  await expect(page.locator('[data-testid="dashboard-appearance-accent-emerald"]')).toBeChecked();
  await expect(page.locator('[data-testid="dashboard-appearance-surface-glass"]')).toBeChecked();
});

test('invalid appearance preferences fall back to safe defaults', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run fallback smoke once on desktop');

  await page.addInitScript(() => {
    localStorage.setItem('geovito_theme_mode', 'invalid-mode');
    localStorage.setItem('theme', 'invalid-mode');
    localStorage.setItem('geovito_theme_accent', 'invalid-accent');
    localStorage.setItem('geovito_surface_style', 'invalid-surface');
  });

  await page.goto('/en/dashboard/');
  await dismissConsentBanner(page);

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme-mode', 'light');
  await expect(html).toHaveAttribute('data-theme-accent', 'brand-default');
  await expect(html).toHaveAttribute('data-surface-style', 'soft');

  await expect(page.locator('[data-testid="dashboard-appearance-mode-light"]')).toBeChecked();
  await expect(page.locator('[data-testid="dashboard-appearance-accent-brand-default"]')).toBeChecked();
  await expect(page.locator('[data-testid="dashboard-appearance-surface-soft"]')).toBeChecked();
});
