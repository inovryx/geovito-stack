import { expect, test } from '@playwright/test';

const MOCK_JWT = 'dashboard-activity-mock-jwt';
const OWNER_EMAIL_HINT = String(process.env.PUBLIC_OWNER_EMAIL || '').trim().toLowerCase();

async function dismissConsentBanner(page: import('@playwright/test').Page): Promise<void> {
  const banner = page.locator('[data-consent-banner]');
  if ((await banner.count()) === 0) return;
  if (await banner.isVisible()) {
    await page.locator('[data-consent-reject]').click();
  }
  await expect(banner).toBeHidden();
}

test('dashboard activity feed supports warn filter and clear history', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run dashboard activity smoke once on desktop');

  await page.route(/\/api\/users\/me\?populate=role$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 7,
        username: 'ops-owner',
        email: 'ops-owner@example.com',
        confirmed: true,
        blocked: false,
        createdAt: '2026-02-01T10:20:00.000Z',
        role: {
          type: 'admin',
          name: 'Admin',
        },
      }),
    });
  });

  await page.route(/\/api\/user-preferences\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { preferred_ui_language: 'en' } }),
    });
  });

  await page.route(/\/api\/blog-comments\/me\/list\?limit=30$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            comment_id: 'comment-user-1',
            body: 'my pending comment',
            language: 'en',
            source: 'registered',
            status: 'pending',
            blog_post_ref: 'post-europe-city-breaks',
            moderation_notes: null,
            created_at: '2026-02-19T18:00:00.000Z',
            updated_at: '2026-02-19T18:00:00.000Z',
          },
        ],
      }),
    });
  });

  await page.route(/\/api\/blog-comments\/moderation\/list\?status=all&limit=40$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            comment_id: 'pending-very-old',
            body: 'needs moderation',
            status: 'pending',
            source: 'guest',
            display_name: 'guest-1',
            blog_post_ref: 'post-europe-city-breaks',
            created_at: '2026-01-01T12:00:00.000Z',
            updated_at: '2026-01-01T12:00:00.000Z',
          },
          {
            comment_id: 'reviewed-1',
            body: 'already approved',
            status: 'approved',
            source: 'registered',
            display_name: 'ops-owner',
            blog_post_ref: 'post-europe-city-breaks',
            moderation_notes: 'Looks good',
            reviewed_by: 'admin',
            reviewed_at: '2026-02-19T18:10:00.000Z',
            created_at: '2026-02-19T18:00:00.000Z',
            updated_at: '2026-02-19T18:10:00.000Z',
          },
        ],
      }),
    });
  });

  await page.route(/\/api\/ui-locales\/meta\/progress\?reference_locale=en$/, async (route) => {
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
              translated_keys: 197,
              missing_keys: 2,
              untranslated_keys: 1,
              coverage_percent: 98.5,
            },
          ],
        },
      }),
    });
  });

  await page.route(/\/\.well-known\/geovito-build\.json$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        build_sha7: 'abc1234',
        build_sha_full: 'abc1234deadbeef',
        build_branch: 'main',
        build_time_utc: '2026-02-20T10:00:00.000Z',
      }),
    });
  });

  await page.addInitScript(([jwt]) => {
    localStorage.setItem(
      'geovito_auth_session',
      JSON.stringify({
        jwt,
        username: 'ops-owner',
        email: 'ops-owner@example.com',
        confirmed: true,
        blocked: false,
        loginAt: '2026-02-20T10:00:00.000Z',
      })
    );
  }, [MOCK_JWT]);

  await page.goto('/en/dashboard/');
  await dismissConsentBanner(page);

  await expect(page.locator('[data-dashboard-activity-feed] .dashboard-activity-item').first()).toBeVisible();
  await expect(page.locator('[data-dashboard-activity-feed]')).toContainText('Build abc1234 is live.');
  await expect(page.locator('[data-dashboard-activity-feed]')).toContainText('comments are pending moderation');
  await expect(page.locator('[data-dashboard-activity-feed]')).toContainText('locales have UI translation gaps');
  await expect(page.locator('[data-dashboard-activity-feed] .dashboard-activity-link', { hasText: 'Runbook' })).toBeVisible();
  await expect(
    page.locator('[data-dashboard-activity-feed] .dashboard-activity-link', { hasText: 'Moderation' }).first()
  ).toBeVisible();
  await expect(
    page.locator('[data-dashboard-activity-feed] .dashboard-activity-link', { hasText: 'Translations' }).first()
  ).toBeVisible();

  await page.check('[data-dashboard-activity-warn-only]');
  const warnBadges = (await page
    .locator('[data-dashboard-activity-feed] .dashboard-activity-item strong')
    .allTextContents())
    .map((value) => value.trim());
  expect(warnBadges.length).toBeGreaterThan(0);
  expect(warnBadges.every((value) => value === 'WARN')).toBeTruthy();

  await page.click('[data-dashboard-activity-clear]');
  await expect(page.locator('[data-dashboard-feedback]')).toContainText('Activity history cleared.');

  const storedHistory = await page.evaluate(() => {
    const raw = localStorage.getItem('geovito_dashboard_activity_history_v1');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return 'invalid';
    }
  });
  expect(storedHistory).toEqual([]);
});

type DashboardRoleCase = {
  id: 'member' | 'editor' | 'admin' | 'owner';
  email: string;
  roleType: string;
  expectedRoleLabel: string;
  expectEditorialLane: boolean;
  expectAdminLane: boolean;
  expectOwnerCards: boolean;
  expectModerationPanel: boolean;
  expectAdminLinks: boolean;
};

const dashboardRoleCases: DashboardRoleCase[] = [
  {
    id: 'member',
    email: 'member@example.com',
    roleType: 'authenticated',
    expectedRoleLabel: 'Member',
    expectEditorialLane: false,
    expectAdminLane: false,
    expectOwnerCards: false,
    expectModerationPanel: false,
    expectAdminLinks: false,
  },
  {
    id: 'editor',
    email: 'editor@example.com',
    roleType: 'editor',
    expectedRoleLabel: 'Editor',
    expectEditorialLane: true,
    expectAdminLane: false,
    expectOwnerCards: false,
    expectModerationPanel: true,
    expectAdminLinks: false,
  },
  {
    id: 'admin',
    email: 'admin@example.com',
    roleType: 'admin',
    expectedRoleLabel: 'Admin',
    expectEditorialLane: true,
    expectAdminLane: true,
    expectOwnerCards: false,
    expectModerationPanel: true,
    expectAdminLinks: true,
  },
];

if (OWNER_EMAIL_HINT) {
  dashboardRoleCases.push({
    id: 'owner',
    email: OWNER_EMAIL_HINT,
    roleType: 'authenticated',
    expectedRoleLabel: 'Owner',
    expectEditorialLane: true,
    expectAdminLane: true,
    expectOwnerCards: true,
    expectModerationPanel: true,
    expectAdminLinks: true,
  });
}

dashboardRoleCases.forEach((roleCase) => {
  test(`dashboard role visibility gate: ${roleCase.id}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Run role visibility smoke once on desktop');

    await page.route(/\/api\/users\/me\?populate=role$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 21,
          username: `${roleCase.id}-user`,
          email: roleCase.email,
          confirmed: true,
          blocked: false,
          createdAt: '2026-02-21T08:00:00.000Z',
          role: {
            type: roleCase.roleType,
            name: roleCase.roleType,
          },
        }),
      });
    });

    await page.route(/\/api\/user-preferences\/me$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { preferred_ui_language: 'en' } }),
      });
    });

    await page.route(/\/api\/blog-comments\/me\/list\?limit=30$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route(/\/api\/blog-comments\/moderation\/list\?status=all&limit=40$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route(/\/api\/ui-locales\/meta\/progress\?reference_locale=en$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            summary: {
              locales_total: 2,
              reference_locale: 'en',
              locales_complete: 1,
              locales_with_missing: 0,
              locales_with_untranslated: 0,
              deploy_required_count: 0,
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
            ],
          },
        }),
      });
    });

    await page.route(/\/\.well-known\/geovito-build\.json$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          build_sha7: 'role123',
          build_sha_full: 'role123deadbeef',
          build_branch: 'main',
          build_time_utc: '2026-02-21T10:00:00.000Z',
        }),
      });
    });

    await page.addInitScript(([jwt, email, roleId]) => {
      localStorage.setItem(
        'geovito_auth_session',
        JSON.stringify({
          jwt,
          username: `${roleId}-session`,
          email,
          confirmed: true,
          blocked: false,
          loginAt: '2026-02-21T10:00:00.000Z',
        })
      );
    }, [MOCK_JWT, roleCase.email, roleCase.id]);

    await page.goto('/en/dashboard/');
    await dismissConsentBanner(page);

    await expect(page.locator('[data-dashboard-role]')).toHaveText(roleCase.expectedRoleLabel);

    const editorialLane = page.locator('[data-dashboard-lane][data-min-role="editor"]');
    const adminLane = page.locator('[data-dashboard-lane][data-min-role="admin"]');
    const moderationPanel = page.locator('[data-dashboard-moderation-wrap]');
    const ownerCards = page.locator('[data-dashboard-role-gated][data-min-role="owner"]:visible');
    const visibleAdminLinks = page.locator('[data-dashboard-admin-link]:visible');

    if (roleCase.expectEditorialLane) {
      await expect(editorialLane).toBeVisible();
    } else {
      await expect(editorialLane).toBeHidden();
    }

    if (roleCase.expectAdminLane) {
      await expect(adminLane).toBeVisible();
    } else {
      await expect(adminLane).toBeHidden();
    }

    if (roleCase.expectModerationPanel) {
      await expect(moderationPanel).toBeVisible();
    } else {
      await expect(moderationPanel).toBeHidden();
    }

    if (roleCase.expectOwnerCards) {
      await expect(ownerCards).toHaveCount(2);
    } else {
      await expect(ownerCards).toHaveCount(0);
    }

    if (roleCase.expectAdminLinks) {
      expect(await visibleAdminLinks.count()).toBeGreaterThan(0);
    } else {
      await expect(visibleAdminLinks).toHaveCount(0);
    }
  });
});
