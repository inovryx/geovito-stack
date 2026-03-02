import { expect, test } from '@playwright/test';

const MOCK_JWT = 'dashboard-activity-mock-jwt';
const OWNER_EMAIL_HINT = String(process.env.PUBLIC_OWNER_EMAIL || '').trim().toLowerCase();

test.beforeEach(async ({ page }) => {
  const savedListRows = [
    {
      list_id: 'list-atlas',
      title: 'Atlas picks',
      visibility: 'private',
    },
    {
      list_id: 'list-stories',
      title: 'Story ideas',
      visibility: 'public',
    },
  ];
  const savedItems = [
    { item_id: 'item-1', list_id: 'list-atlas', target_type: 'place', target_ref: 'italy-pilot' },
    { item_id: 'item-2', list_id: 'list-atlas', target_type: 'place', target_ref: 'berlin' },
    { item_id: 'item-3', list_id: 'list-atlas', target_type: 'post', target_ref: 'post-neighborhood-layers' },
    { item_id: 'item-4', list_id: 'list-stories', target_type: 'post', target_ref: 'post-city-break' },
    { item_id: 'item-5', list_id: 'list-stories', target_type: 'post', target_ref: 'post-route-cues' },
  ];

  await page.route(/\/api\/user-follows\/me\/list\?limit=500$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          follow_system_enabled: false,
          items: [
            { id: 1, target_type: 'user' },
            { id: 2, target_type: 'place' },
            { id: 3, target_type: 'place' },
          ],
        },
      }),
    });
  });
  await page.route(/\/api\/user-saved-lists\/me\/lists\?limit=200$/, async (route) => {
    const lists = savedListRows.map((row) => ({
      ...row,
      item_count: savedItems.filter((item) => item.list_id === row.list_id).length,
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          items: lists,
        },
      }),
    });
  });
  await page.route(/\/api\/user-saved-lists\/me\/items\?limit=500$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          items: savedItems,
        },
      }),
    });
  });
  await page.route(/\/api\/user-saved-lists\/me\/items\/toggle$/, async (route) => {
    let payload: { list_id?: string; target_type?: string; target_ref?: string; action?: string } = {};
    try {
      payload = route.request().postDataJSON() as {
        list_id?: string;
        target_type?: string;
        target_ref?: string;
        action?: string;
      };
    } catch {
      payload = {};
    }

    if (payload.action === 'unsave') {
      const index = savedItems.findIndex(
        (item) =>
          item.list_id === payload.list_id &&
          item.target_type === payload.target_type &&
          item.target_ref === payload.target_ref
      );
      if (index >= 0) {
        savedItems.splice(index, 1);
      }
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { ok: true } }),
    });
  });
  await page.route(/\/api\/content-reports\/moderation\/list\?limit=60$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });
  await page.route(/\/api\/account-requests\/moderation\/list\?limit=60$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
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
          badges_visible: false,
          follow_system_enabled: false,
          notifications_defaults: null,
          safety_notice_templates: null,
        },
      }),
    });
  });
});

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
      body: JSON.stringify({
        data: {
          preferred_ui_language: 'en',
          notifications_site_enabled: false,
          notifications_email_enabled: false,
          notifications_digest: 'daily',
        },
      }),
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
            locales_with_gaps: 2,
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
  await expect(page.locator('[data-dashboard-activity-feed]')).toContainText('Follow system is disabled in community settings.');
  await expect(page.locator('[data-dashboard-activity-feed]')).toContainText('Badge visibility is disabled in community settings.');
  await expect(page.locator('[data-dashboard-activity-feed]')).toContainText('In-site notifications are disabled on your profile.');
  await expect(page.locator('[data-dashboard-activity-feed]')).toContainText('Email notifications are disabled on your profile.');
  await expect(
    page.locator('[data-dashboard-activity-feed] .dashboard-activity-link', { hasText: 'Runbook' }).first()
  ).toBeVisible();
  await expect(
    page.locator('[data-dashboard-activity-feed] .dashboard-activity-link', { hasText: 'Moderation' }).first()
  ).toBeVisible();
  await expect(
    page.locator('[data-dashboard-activity-feed] .dashboard-activity-link', { hasText: 'Translations' }).first()
  ).toBeVisible();
  await expect(page.locator('[data-dashboard-community-open-mode]')).toContainText('Controlled');
  await expect(page.locator('[data-dashboard-community-follow-enabled]')).toContainText('Disabled');
  await expect(page.locator('[data-dashboard-community-citizen-card]')).toContainText('Enabled');
  await expect(page.locator('[data-dashboard-community-badges]')).toContainText('Disabled');
  await expect(page.locator('[data-dashboard-follow-system]')).toHaveText('Disabled');
  await expect(page.locator('[data-dashboard-follow-total]')).toHaveText('3');
  await expect(page.locator('[data-dashboard-follow-users]')).toHaveText('1');
  await expect(page.locator('[data-dashboard-follow-places]')).toHaveText('2');
  await expect(page.locator('[data-dashboard-saved-lists-total-lists]')).toHaveText('2');
  await expect(page.locator('[data-dashboard-saved-lists-total-items]')).toHaveText('5');
  await expect(page.locator('[data-dashboard-saved-lists-total-posts]')).toHaveText('3');
  await expect(page.locator('[data-dashboard-saved-lists-total-places]')).toHaveText('2');
  await expect(page.locator('[data-dashboard-saved-lists-items]')).toBeVisible();
  await expect(page.locator('[data-dashboard-saved-lists-items]')).toContainText('italy-pilot');
  await expect(page.locator('[data-dashboard-saved-lists-items] a[href="/en/atlas/italy-pilot/"]')).toHaveCount(1);
  await page.click('[data-dashboard-saved-remove][data-target-ref="italy-pilot"]');
  await expect(page.locator('[data-dashboard-feedback]')).toContainText('Saved item removed.');
  await expect(page.locator('[data-dashboard-saved-lists-total-items]')).toHaveText('4');
  await expect(page.locator('[data-dashboard-saved-lists-total-posts]')).toHaveText('3');
  await expect(page.locator('[data-dashboard-saved-lists-total-places]')).toHaveText('1');
  await expect(page.locator('[data-dashboard-saved-lists-items]')).not.toContainText('italy-pilot');
  await expect(page.locator('[data-dashboard-saved-lists-items]')).toContainText('post-city-break');
  await expect(page.locator('[data-dashboard-notifications-site]')).toHaveText('Disabled');
  await expect(page.locator('[data-dashboard-notifications-email]')).toHaveText('Disabled');
  await expect(page.locator('[data-dashboard-notifications-digest]')).toHaveText('Daily');

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

test('dashboard editorial inbox renders report and account-request queues with moderation actions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run editorial inbox smoke once on desktop');

  let reportRows = [
    {
      report_id: 'report-1',
      target_type: 'comment',
      target_ref: 'comment-101',
      reason: 'spam',
      status: 'new',
      created_at: '2026-02-21T09:00:00.000Z',
      updated_at: '2026-02-21T09:00:00.000Z',
    },
  ];
  let requestRows = [
    {
      request_id: 'acct-1',
      request_type: 'delete',
      status: 'new',
      reason: 'Please remove account permanently.',
      created_at: '2026-02-21T09:10:00.000Z',
      updated_at: '2026-02-21T09:10:00.000Z',
    },
  ];

  await page.route(/\/api\/users\/me\?populate=role$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 61,
        username: 'editor-user',
        email: 'editor@example.com',
        confirmed: true,
        blocked: false,
        createdAt: '2026-02-21T08:00:00.000Z',
        role: {
          type: 'editor',
          name: 'Editor',
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
  await page.route(/\/api\/creator-profile\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          username: 'editor-user',
          visibility: 'public',
        },
      }),
    });
  });
  await page.route(/\/api\/blog-posts\/me\/list\?limit=120$/, async (route) => {
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
            locales_total: 1,
            reference_locale: 'en',
            locales_complete: 1,
            locales_with_gaps: 0,
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

  await page.route(/\/api\/content-reports\/moderation\/list\?limit=60$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: reportRows }),
    });
  });
  await page.route(/\/api\/account-requests\/moderation\/list\?limit=60$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: requestRows }),
    });
  });

  await page.route(/\/api\/content-reports\/moderation\/set$/, async (route) => {
    const payload = route.request().postDataJSON() as { report_id?: string; next_status?: string };
    reportRows = reportRows.map((item) =>
      item.report_id === payload?.report_id
        ? { ...item, status: String(payload?.next_status || item.status), updated_at: '2026-02-21T09:20:00.000Z' }
        : item
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: reportRows[0] }),
    });
  });
  await page.route(/\/api\/account-requests\/moderation\/set$/, async (route) => {
    const payload = route.request().postDataJSON() as { request_id?: string; next_status?: string };
    requestRows = requestRows.map((item) =>
      item.request_id === payload?.request_id
        ? { ...item, status: String(payload?.next_status || item.status), updated_at: '2026-02-21T09:30:00.000Z' }
        : item
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: requestRows[0] }),
    });
  });

  await page.route(/\/\.well-known\/geovito-build\.json$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        build_sha7: 'editor12',
        build_sha_full: 'editor12deadbeef',
        build_branch: 'main',
        build_time_utc: '2026-02-21T10:00:00.000Z',
      }),
    });
  });

  await page.addInitScript(([jwt]) => {
    localStorage.setItem(
      'geovito_auth_session',
      JSON.stringify({
        jwt,
        username: 'editor-user',
        email: 'editor@example.com',
        confirmed: true,
        blocked: false,
        loginAt: '2026-02-21T10:00:00.000Z',
      })
    );
  }, [MOCK_JWT]);

  await page.goto('/en/dashboard/#dashboard-editorial-moderation');
  await dismissConsentBanner(page);

  await expect(page.locator('[data-dashboard-report-new]')).toHaveText('1');
  await expect(page.locator('[data-dashboard-account-request-new]')).toHaveText('1');
  await expect(page.locator('[data-dashboard-report-list]')).toContainText('COMMENT');
  await expect(page.locator('[data-dashboard-account-request-list]')).toContainText('DELETE');

  await page.locator('[data-dashboard-report-set="reviewing"][data-report-id="report-1"]').click();
  await expect(page.locator('[data-dashboard-report-reviewing]')).toHaveText('1');

  await page
    .locator('[data-dashboard-account-request-set="approved"][data-request-id="acct-1"]')
    .click();
  await expect(page.locator('[data-dashboard-account-request-approved]')).toHaveText('1');
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
              locales_with_gaps: 0,
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
    const quickLocale = page.locator('[data-dashboard-quick-id="locale-progress"]');
    const quickComments = page.locator('[data-dashboard-quick-id="comments"]');
    const quickControl = page.locator('[data-dashboard-quick-id="control"]');
    const quickOwnerOps = page.locator('[data-dashboard-quick-id="owner-ops"]');
    const ownerReleaseWidget = page.locator('[data-dashboard-owner-widget="release"]');
    const ownerModerationWidget = page.locator('[data-dashboard-owner-widget="moderation"]');
    const ownerLocaleWidget = page.locator('[data-dashboard-owner-widget="locale"]');
    const ownerReleaseAction = page.locator('[data-dashboard-owner-widget-action="release"]');
    const ownerModerationAction = page.locator('[data-dashboard-owner-widget-action="moderation"]');
    const ownerLocaleAction = page.locator('[data-dashboard-owner-widget-action="locale"]');
    const ownerReleaseBadge = page.locator('[data-dashboard-owner-widget-badge="release"]');
    const ownerModerationBadge = page.locator('[data-dashboard-owner-widget-badge="moderation"]');
    const ownerLocaleBadge = page.locator('[data-dashboard-owner-widget-badge="locale"]');
    const sidebarMemberModuleLink = page
      .locator('.desktop-tablet-column [data-auth-dashboard-link][href="/en/dashboard/#dashboard-member"]')
      .first();
    const sidebarSettingsModuleLink = page
      .locator('.desktop-tablet-column [data-auth-dashboard-link][href="/en/dashboard/#dashboard-member-settings"]')
      .first();
    const sidebarModerationModuleLink = page
      .locator('.desktop-tablet-column [data-auth-dashboard-link][href="/en/dashboard/#dashboard-editorial-moderation"]')
      .first();
    const sidebarTranslationModuleLink = page
      .locator('.desktop-tablet-column [data-auth-dashboard-link][href="/en/dashboard/#dashboard-editorial-locale"]')
      .first();
    const sidebarSeoModuleLink = page
      .locator('.desktop-tablet-column [data-auth-dashboard-link][href="/en/dashboard/#dashboard-control"]')
      .first();
    const sidebarAdsModuleLink = page
      .locator('.desktop-tablet-column [data-auth-dashboard-link][href="/en/dashboard/#dashboard-control-ads"]')
      .first();
    const sidebarWorkspaceDashboard = page
      .locator('.desktop-tablet-column [data-auth-workspace-link][href="/en/dashboard/"]')
      .first();
    const sidebarWorkspaceAccount = page
      .locator('.desktop-tablet-column [data-auth-workspace-link][href="/en/account/"]')
      .first();
    const sidebarWorkspaceComments = page
      .locator('.desktop-tablet-column [data-auth-workspace-link][href="/en/account/?commentState=pending#comments"]')
      .first();
    const sidebarWorkspaceLocale = page
      .locator('.desktop-tablet-column [data-auth-workspace-link][href="/en/account/#locale-progress"]')
      .first();
    const sidebarAdminModeration = page
      .locator('.desktop-tablet-column [data-auth-admin-link][href="/en/dashboard/#dashboard-editorial-moderation"]')
      .first();
    const sidebarAdminReports = page
      .locator('.desktop-tablet-column [data-auth-admin-link][href="/en/dashboard/#dashboard-editorial-reports"]')
      .first();
    const sidebarAdminAccountRequests = page
      .locator('.desktop-tablet-column [data-auth-admin-link][href="/en/dashboard/#dashboard-editorial-account-requests"]')
      .first();
    const sidebarAdminTranslation = page
      .locator('.desktop-tablet-column [data-auth-admin-link][href="/en/dashboard/#dashboard-editorial-locale"]')
      .first();
    const sidebarAdminSeo = page
      .locator('.desktop-tablet-column [data-auth-admin-link][href="/en/dashboard/#dashboard-control"]')
      .first();
    const sidebarAdminAds = page
      .locator('.desktop-tablet-column [data-auth-admin-link][href="/en/dashboard/#dashboard-control-ads"]')
      .first();
    const sidebarAdminStrapi = page
      .locator('.desktop-tablet-column [data-auth-admin-link][target="_blank"]')
      .first();

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
      await expect(ownerReleaseWidget).toBeVisible();
      await expect(ownerModerationWidget).toBeVisible();
      await expect(ownerLocaleWidget).toBeVisible();
      await expect(ownerReleaseWidget).toHaveAttribute('data-state', 'ok');
      await expect(ownerModerationWidget).toHaveAttribute('data-state', 'ok');
      await expect(ownerLocaleWidget).toHaveAttribute('data-state', 'ok');
      await expect(page.locator('[data-dashboard-owner-widget-release-detail]')).toContainText('role123');
      await expect(ownerReleaseAction).toBeVisible();
      await expect(ownerReleaseAction).toHaveAttribute('href', /LAUNCH_RUNBOOK\.md$/);
      await expect(ownerModerationAction).toBeVisible();
      await expect(ownerModerationAction).toHaveAttribute('href', /\/en\/account\/\?commentState=pending#comments$/);
      await expect(ownerLocaleAction).toBeVisible();
      await expect(ownerLocaleAction).toHaveAttribute('href', '#dashboard-editorial-locale');
      await expect(ownerReleaseBadge).toBeHidden();
      await expect(ownerModerationBadge).toBeHidden();
      await expect(ownerLocaleBadge).toBeHidden();
    } else {
      await expect(ownerCards).toHaveCount(0);
      await expect(ownerReleaseWidget).toBeHidden();
      await expect(ownerModerationWidget).toBeHidden();
      await expect(ownerLocaleWidget).toBeHidden();
      await expect(ownerReleaseAction).toBeHidden();
      await expect(ownerModerationAction).toBeHidden();
      await expect(ownerLocaleAction).toBeHidden();
      await expect(ownerReleaseBadge).toBeHidden();
      await expect(ownerModerationBadge).toBeHidden();
      await expect(ownerLocaleBadge).toBeHidden();
    }

    if (roleCase.expectAdminLinks) {
      expect(await visibleAdminLinks.count()).toBeGreaterThan(0);
    } else {
      await expect(visibleAdminLinks).toHaveCount(0);
    }

    if (roleCase.expectEditorialLane) {
      await expect(quickLocale).toBeVisible();
    } else {
      await expect(quickLocale).toBeHidden();
    }

    await expect(quickComments).toBeVisible();
    await expect(quickComments).toHaveAttribute('href', /\/en\/account\/\?commentState=pending#comments$/);

    if (roleCase.expectAdminLane) {
      await expect(quickControl).toBeVisible();
    } else {
      await expect(quickControl).toBeHidden();
    }

    if (roleCase.expectOwnerCards) {
      await expect(quickOwnerOps).toBeVisible();
    } else {
      await expect(quickOwnerOps).toBeHidden();
    }

    await expect(sidebarMemberModuleLink).toBeVisible();
    await expect(sidebarSettingsModuleLink).toBeVisible();
    await expect(sidebarWorkspaceDashboard).toBeVisible();
    await expect(sidebarWorkspaceAccount).toBeVisible();
    await expect(sidebarWorkspaceComments).toBeVisible();

    if (roleCase.expectEditorialLane) {
      await expect(sidebarModerationModuleLink).toBeVisible();
      await expect(sidebarTranslationModuleLink).toBeVisible();
      await expect(sidebarWorkspaceLocale).toBeVisible();
      await expect(sidebarAdminModeration).toBeVisible();
      await expect(sidebarAdminReports).toBeVisible();
      await expect(sidebarAdminAccountRequests).toBeVisible();
      await expect(sidebarAdminTranslation).toBeVisible();
    } else {
      await expect(sidebarModerationModuleLink).toBeHidden();
      await expect(sidebarTranslationModuleLink).toBeHidden();
      await expect(sidebarWorkspaceLocale).toBeHidden();
      await expect(sidebarAdminModeration).toBeHidden();
      await expect(sidebarAdminReports).toBeHidden();
      await expect(sidebarAdminAccountRequests).toBeHidden();
      await expect(sidebarAdminTranslation).toBeHidden();
    }

    if (roleCase.expectAdminLane) {
      await expect(sidebarSeoModuleLink).toBeVisible();
      await expect(sidebarAdsModuleLink).toBeVisible();
      await expect(sidebarAdminSeo).toBeVisible();
      await expect(sidebarAdminAds).toBeVisible();
      await expect(sidebarAdminStrapi).toBeVisible();
    } else {
      await expect(sidebarSeoModuleLink).toBeHidden();
      await expect(sidebarAdsModuleLink).toBeHidden();
      await expect(sidebarAdminSeo).toBeHidden();
      await expect(sidebarAdminAds).toBeHidden();
      await expect(sidebarAdminStrapi).toBeHidden();
    }
  });
});

test('dashboard owner widgets show warning states when signals are present', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run owner widget warning smoke once on desktop');
  test.skip(!OWNER_EMAIL_HINT, 'PUBLIC_OWNER_EMAIL is required to resolve owner role');

  await page.route(/\/api\/users\/me\?populate=role$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 88,
        username: 'owner-user',
        email: OWNER_EMAIL_HINT,
        confirmed: true,
        blocked: false,
        createdAt: '2026-02-21T08:00:00.000Z',
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
      body: JSON.stringify({
        data: [
          {
            comment_id: 'pending-owner-1',
            body: 'owner queue item',
            status: 'pending',
            source: 'guest',
            display_name: 'guest-owner',
            blog_post_ref: 'post-owner-signals',
            created_at: '2026-01-01T12:00:00.000Z',
            updated_at: '2026-01-01T12:00:00.000Z',
          },
        ],
        meta: {
          summary: {
            pending_total: 7,
            stale_pending_total: 3,
            oldest_pending_hours: 96,
            stale_threshold_hours: 36,
          },
        },
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
            locales_with_gaps: 1,
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
        build_sha7: 'owner77',
        build_sha_full: 'owner77deadbeef',
        build_branch: 'main',
        build_time_utc: '2026-02-21T10:00:00.000Z',
      }),
    });
  });

  await page.addInitScript(([jwt, email]) => {
    localStorage.setItem(
      'geovito_auth_session',
      JSON.stringify({
        jwt,
        username: 'owner-user',
        email,
        confirmed: true,
        blocked: false,
        loginAt: '2026-02-21T10:00:00.000Z',
      })
    );
  }, [MOCK_JWT, OWNER_EMAIL_HINT]);

  await page.goto('/en/dashboard/');
  await dismissConsentBanner(page);

  const releaseWidget = page.locator('[data-dashboard-owner-widget="release"]');
  const moderationWidget = page.locator('[data-dashboard-owner-widget="moderation"]');
  const localeWidget = page.locator('[data-dashboard-owner-widget="locale"]');
  const communityWidget = page.locator('[data-dashboard-owner-widget="community"]');
  const moderationAction = page.locator('[data-dashboard-owner-widget-action="moderation"]');
  const localeAction = page.locator('[data-dashboard-owner-widget-action="locale"]');
  const communityAction = page.locator('[data-dashboard-owner-widget-action="community"]');
  const communityFollowAction = page.locator('[data-dashboard-owner-widget-action="community-follow"]');
  const communityNotificationsAction = page.locator('[data-dashboard-owner-widget-action="community-notifications"]');
  const communitySavedAction = page.locator('[data-dashboard-owner-widget-action="community-saved"]');
  const releaseBadge = page.locator('[data-dashboard-owner-widget-badge="release"]');
  const moderationBadge = page.locator('[data-dashboard-owner-widget-badge="moderation"]');
  const localeBadge = page.locator('[data-dashboard-owner-widget-badge="locale"]');
  const communityBadge = page.locator('[data-dashboard-owner-widget-badge="community"]');

  await expect(releaseWidget).toHaveAttribute('data-state', 'warn');
  await expect(moderationWidget).toHaveAttribute('data-state', 'warn');
  await expect(localeWidget).toHaveAttribute('data-state', 'warn');
  await expect(communityWidget).toHaveAttribute('data-state', 'info');
  await expect(page.locator('[data-dashboard-owner-widget-release-detail]')).toContainText('owner77');
  await expect(page.locator('[data-dashboard-owner-widget-moderation-detail]')).toContainText('older than 36h');
  await expect(page.locator('[data-dashboard-owner-widget-locale-detail]')).toContainText('locales have UI translation gaps');
  await expect(page.locator('[data-dashboard-owner-widget-community-detail]')).toContainText(
    'Follow system is disabled in community settings.'
  );
  await expect(page.locator('[data-dashboard-locale-list] .dashboard-mini-item').first()).toContainText('TR');
  await expect(page.locator('[data-dashboard-locale-list] .dashboard-mini-item').first()).toContainText('8 missing');
  await expect(page.locator('[data-dashboard-locale-list] .dashboard-mini-item').first()).toContainText('deploy');
  await expect(page.locator('[data-dashboard-locale-list] .dashboard-mini-item [data-dashboard-locale-link]').first()).toHaveAttribute(
    'href',
    /\/en\/account\/\?locale=tr&state=missing#locale-progress$/
  );
  await expect(page.locator('[data-dashboard-moderation-pending]')).toHaveText('7');
  await expect(page.locator('[data-dashboard-moderation-stale]')).toHaveText('3');
  await expect(page.locator('[data-dashboard-moderation-oldest]')).toHaveText('96h');
  await expect(page.locator('[data-dashboard-owner-follow-total]')).toHaveText('3');
  await expect(page.locator('[data-dashboard-owner-saved-items]')).toHaveText('5');
  await expect(page.locator('[data-dashboard-owner-notification-site]')).toHaveText('Unknown');
  await expect(page.locator('[data-dashboard-owner-notification-email]')).toHaveText('Unknown');
  await expect(releaseBadge).toHaveText('4');
  await expect(moderationBadge).toHaveText('7');
  await expect(localeBadge).toHaveText('2');
  await expect(releaseBadge).toHaveAttribute('data-level', 'critical');
  await expect(moderationBadge).toHaveAttribute('data-level', 'critical');
  await expect(localeBadge).toHaveAttribute('data-level', 'default');
  await expect(releaseBadge).toHaveAttribute('title', /4$/);
  await expect(moderationBadge).toHaveAttribute('title', /7$/);
  await expect(localeBadge).toHaveAttribute('title', /2$/);
  await expect(communityBadge).toHaveText('1');
  await expect(communityBadge).toHaveAttribute('data-level', 'default');

  await expect(moderationAction).toHaveAttribute('href', /\/en\/account\/\?commentState=pending#comments$/);
  await expect(communityFollowAction).toHaveAttribute('href', '#dashboard-member');
  await expect(communityNotificationsAction).toHaveAttribute('href', '#dashboard-member');
  await expect(communitySavedAction).toHaveAttribute('href', '#dashboard-member');
  await expect(communityFollowAction).toHaveAttribute('data-dashboard-focus-target', 'dashboard-member-follow');
  await expect(communityNotificationsAction).toHaveAttribute('data-dashboard-focus-target', 'dashboard-member-notifications');
  await expect(communitySavedAction).toHaveAttribute('data-dashboard-focus-target', 'dashboard-member-saved-lists');
  await expect(communityAction).toHaveAttribute('href', /\/admin\/content-manager\/single-types\/api::community-setting\.community-setting$/);

  await communityFollowAction.click();
  await expect(page).toHaveURL(/#dashboard-member$/);
  await expect(page.locator('[data-dashboard-section-pill][href="#dashboard-member"]').first()).toHaveClass(/is-active/);
  await expect(page.locator('#dashboard-member-follow')).toBeVisible();

  await localeAction.click();
  await expect(page).toHaveURL(/#dashboard-editorial-locale$/);
  await expect(localeAction).toHaveAttribute('href', '#dashboard-editorial-locale');
});

test('dashboard locale widget uses info state when only untranslated locales are pending', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run untranslated-only locale smoke once on desktop');
  test.skip(!OWNER_EMAIL_HINT, 'PUBLIC_OWNER_EMAIL is required to resolve owner role');

  await page.route(/\/api\/users\/me\?populate=role$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 89,
        username: 'owner-user',
        email: OWNER_EMAIL_HINT,
        confirmed: true,
        blocked: false,
        createdAt: '2026-02-21T08:00:00.000Z',
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
      body: JSON.stringify({
        data: [],
        meta: {
          summary: {
            pending_total: 0,
            stale_pending_total: 0,
            oldest_pending_hours: 0,
            stale_threshold_hours: 24,
          },
        },
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
            locales_total: 2,
            reference_locale: 'en',
            locales_complete: 1,
            locales_with_gaps: 1,
            locales_with_missing: 0,
            locales_with_untranslated: 1,
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
            {
              ui_locale: 'tr',
              status: 'draft',
              reference_locale: 'en',
              deploy_required: false,
              total_keys: 200,
              translated_keys: 194,
              missing_keys: 0,
              untranslated_keys: 6,
              coverage_percent: 97,
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
        build_sha7: 'owner88',
        build_sha_full: 'owner88deadbeef',
        build_branch: 'main',
        build_time_utc: '2026-02-21T10:00:00.000Z',
      }),
    });
  });

  await page.addInitScript(([jwt, email]) => {
    localStorage.setItem(
      'geovito_auth_session',
      JSON.stringify({
        jwt,
        username: 'owner-user',
        email,
        confirmed: true,
        blocked: false,
        loginAt: '2026-02-21T10:00:00.000Z',
      })
    );
  }, [MOCK_JWT, OWNER_EMAIL_HINT]);

  await page.goto('/en/dashboard/');
  await dismissConsentBanner(page);

  await expect(page.locator('[data-dashboard-owner-widget="release"]')).toHaveAttribute('data-state', 'warn');
  await expect(page.locator('[data-dashboard-owner-widget="moderation"]')).toHaveAttribute('data-state', 'ok');
  await expect(page.locator('[data-dashboard-owner-widget="locale"]')).toHaveAttribute('data-state', 'info');
  await expect(page.locator('[data-dashboard-owner-widget-locale-detail]')).toContainText('locales have UI translation gaps');
  await expect(page.locator('[data-dashboard-owner-widget-badge="locale"]')).toHaveText('1');
  await expect(page.locator('[data-dashboard-locale-list] .dashboard-mini-item').first()).toContainText('TR');
  await expect(page.locator('[data-dashboard-locale-list] .dashboard-mini-item').first()).toContainText('6 untranslated');
  await expect(page.locator('[data-dashboard-locale-list] .dashboard-mini-item [data-dashboard-locale-link]').first()).toHaveAttribute(
    'href',
    /\/en\/account\/\?locale=tr&state=untranslated#locale-progress$/
  );
});

test('dashboard lane collapse state persists between reloads', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run lane collapse smoke once on desktop');

  await page.route(/\/api\/users\/me\?populate=role$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 31,
        username: 'admin-user',
        email: 'admin@example.com',
        confirmed: true,
        blocked: false,
        createdAt: '2026-02-21T08:00:00.000Z',
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
            locales_total: 1,
            reference_locale: 'en',
            locales_complete: 1,
            locales_with_gaps: 0,
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
        build_sha7: 'lane321',
        build_sha_full: 'lane321deadbeef',
        build_branch: 'main',
        build_time_utc: '2026-02-21T10:00:00.000Z',
      }),
    });
  });

  await page.addInitScript(([jwt]) => {
    localStorage.setItem(
      'geovito_auth_session',
      JSON.stringify({
        jwt,
        username: 'admin-user',
        email: 'admin@example.com',
        confirmed: true,
        blocked: false,
        loginAt: '2026-02-21T10:00:00.000Z',
      })
    );
  }, [MOCK_JWT]);

  await page.goto('/en/dashboard/');
  await dismissConsentBanner(page);

  const memberLaneContent = page.locator('#dashboard-member [data-dashboard-lane-content]');
  const memberLaneToggle = page.locator('#dashboard-member [data-dashboard-lane-toggle]');

  await expect(memberLaneContent).toBeVisible();
  await expect(memberLaneToggle).toHaveAttribute('aria-expanded', 'true');

  await memberLaneToggle.click();
  await expect(memberLaneContent).toBeHidden();
  await expect(memberLaneToggle).toHaveAttribute('aria-expanded', 'false');

  const storedAfterCollapse = await page.evaluate(() => {
    const raw = localStorage.getItem('geovito_dashboard_lane_state_v1');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return 'invalid';
    }
  });
  expect(storedAfterCollapse).toMatchObject({ 'dashboard-member': true });

  await page.reload();
  await dismissConsentBanner(page);
  await page.waitForLoadState('networkidle');
  await expect(memberLaneContent).toBeHidden();

  await memberLaneToggle.click();
  await expect(memberLaneContent).toBeVisible();
  await expect(memberLaneToggle).toHaveAttribute('aria-expanded', 'true');
});

test('dashboard section nav falls back to visible lane when hash lane is hidden', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run section nav fallback smoke once on desktop');

  await page.route(/\/api\/users\/me\?populate=role$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 44,
        username: 'member-user',
        email: 'member@example.com',
        confirmed: true,
        blocked: false,
        createdAt: '2026-02-21T08:00:00.000Z',
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

  await page.route(/\/api\/ui-locales\/meta\/progress\?reference_locale=en$/, async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ data: null, error: { message: 'forbidden' } }),
    });
  });

  await page.route(/\/\.well-known\/geovito-build\.json$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        build_sha7: 'member11',
        build_sha_full: 'member11deadbeef',
        build_branch: 'main',
        build_time_utc: '2026-02-21T10:00:00.000Z',
      }),
    });
  });

  await page.addInitScript(([jwt]) => {
    localStorage.setItem(
      'geovito_auth_session',
      JSON.stringify({
        jwt,
        username: 'member-user',
        email: 'member@example.com',
        confirmed: true,
        blocked: false,
        loginAt: '2026-02-21T10:00:00.000Z',
      })
    );
  }, [MOCK_JWT]);

  await page.goto('/en/dashboard/#dashboard-control');
  await dismissConsentBanner(page);

  const memberPill = page.locator('[data-dashboard-section-pill][href="#dashboard-member"]').first();
  const controlPill = page.locator('[data-dashboard-section-pill][href="#dashboard-control"]').first();
  const memberSidebarLink = page
    .locator('.desktop-tablet-column [data-auth-dashboard-link][href="/en/dashboard/#dashboard-member"]')
    .first();

  await expect(controlPill).toBeHidden();
  await expect(memberPill).toHaveClass(/is-active/);
  await expect(memberSidebarLink).toHaveClass(/is-active/);
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#dashboard-member');
});

test('dashboard section nav tracks hash and click for admin lanes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run section nav hash/click smoke once on desktop');

  await page.route(/\/api\/users\/me\?populate=role$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 55,
        username: 'admin-user',
        email: 'admin@example.com',
        confirmed: true,
        blocked: false,
        createdAt: '2026-02-21T08:00:00.000Z',
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
            locales_total: 1,
            reference_locale: 'en',
            locales_complete: 1,
            locales_with_gaps: 0,
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
        build_sha7: 'admin111',
        build_sha_full: 'admin111deadbeef',
        build_branch: 'main',
        build_time_utc: '2026-02-21T10:00:00.000Z',
      }),
    });
  });

  await page.addInitScript(([jwt]) => {
    localStorage.setItem(
      'geovito_auth_session',
      JSON.stringify({
        jwt,
        username: 'admin-user',
        email: 'admin@example.com',
        confirmed: true,
        blocked: false,
        loginAt: '2026-02-21T10:00:00.000Z',
      })
    );
  }, [MOCK_JWT]);

  await page.goto('/en/dashboard/');
  await dismissConsentBanner(page);

  const memberPill = page.locator('[data-dashboard-section-pill][href="#dashboard-member"]').first();
  const controlPill = page.locator('[data-dashboard-section-pill][href="#dashboard-control"]').first();

  await expect(controlPill).toBeVisible();
  await expect(memberPill).toHaveClass(/is-active/);

  await page.evaluate(() => {
    window.location.hash = '#dashboard-control';
  });
  await expect(controlPill).toHaveClass(/is-active/);

  await memberPill.click();
  await expect(memberPill).toHaveClass(/is-active/);
});

test('dashboard admin tools links open matching module lanes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run admin tools lane wiring smoke once on desktop');

  await page.route(/\/api\/users\/me\?populate=role$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 56,
        username: 'admin-user',
        email: 'admin@example.com',
        confirmed: true,
        blocked: false,
        createdAt: '2026-02-21T08:00:00.000Z',
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
            locales_total: 1,
            reference_locale: 'en',
            locales_complete: 1,
            locales_with_gaps: 0,
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
        build_sha7: 'adminlan',
        build_sha_full: 'adminlandeadbeef',
        build_branch: 'main',
        build_time_utc: '2026-02-21T10:00:00.000Z',
      }),
    });
  });

  await page.addInitScript(([jwt]) => {
    localStorage.setItem(
      'geovito_auth_session',
      JSON.stringify({
        jwt,
        username: 'admin-user',
        email: 'admin@example.com',
        confirmed: true,
        blocked: false,
        loginAt: '2026-02-21T10:00:00.000Z',
      })
    );
  }, [MOCK_JWT]);

  await page.goto('/en/dashboard/#dashboard-member');
  await dismissConsentBanner(page);

  const adminModerationLink = page
    .locator('.desktop-tablet-column [data-auth-admin-link][href="/en/dashboard/#dashboard-editorial-moderation"]')
    .first();
  const adminReportsLink = page
    .locator('.desktop-tablet-column [data-auth-admin-link][href="/en/dashboard/#dashboard-editorial-reports"]')
    .first();
  const adminAccountRequestsLink = page
    .locator('.desktop-tablet-column [data-auth-admin-link][href="/en/dashboard/#dashboard-editorial-account-requests"]')
    .first();
  const adminSeoLink = page
    .locator('.desktop-tablet-column [data-auth-admin-link][href="/en/dashboard/#dashboard-control"]')
    .first();
  const adminAdsLink = page
    .locator('.desktop-tablet-column [data-auth-admin-link][href="/en/dashboard/#dashboard-control-ads"]')
    .first();

  const memberLane = page.locator('#dashboard-member');
  const editorialLane = page.locator('#dashboard-editorial');
  const controlLane = page.locator('#dashboard-control');
  const moderationCard = page.locator('#dashboard-editorial-moderation');
  const reportsCard = page.locator('#dashboard-editorial-reports');
  const accountRequestsCard = page.locator('#dashboard-editorial-account-requests');
  const adsCard = page.locator('#dashboard-control-ads');
  const controlPill = page.locator('[data-dashboard-section-pill][href="#dashboard-control"]').first();
  const adsPill = page.locator('[data-dashboard-section-pill][href="#dashboard-control-ads"]').first();

  await expect(memberLane).toBeVisible();
  await expect(adminModerationLink).toBeVisible();
  await expect(adminReportsLink).toBeVisible();
  await expect(adminAccountRequestsLink).toBeVisible();
  await expect(adminSeoLink).toBeVisible();
  await expect(adminAdsLink).toBeVisible();

  await adminModerationLink.click();
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#dashboard-editorial-moderation');
  await expect(editorialLane).toBeVisible();
  await expect(memberLane).toBeHidden();
  await expect(moderationCard).toBeVisible();
  await expect(adminModerationLink).toHaveClass(/is-active/);

  await adminReportsLink.click();
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#dashboard-editorial-reports');
  await expect(editorialLane).toBeVisible();
  await expect(reportsCard).toBeVisible();
  await expect(adminReportsLink).toHaveClass(/is-active/);

  await adminAccountRequestsLink.click();
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe(
    '#dashboard-editorial-account-requests'
  );
  await expect(editorialLane).toBeVisible();
  await expect(accountRequestsCard).toBeVisible();
  await expect(adminAccountRequestsLink).toHaveClass(/is-active/);

  await adminSeoLink.click();
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#dashboard-control');
  await expect(controlLane).toBeVisible();
  await expect(editorialLane).toBeHidden();
  await expect(controlPill).toHaveClass(/is-active/);
  await expect(adminSeoLink).toHaveClass(/is-active/);

  await adminAdsLink.click();
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#dashboard-control-ads');
  await expect(controlLane).toBeVisible();
  await expect(adsCard).toBeVisible();
  await expect(adsPill).toHaveClass(/is-active/);
  await expect(adminAdsLink).toHaveClass(/is-active/);
});

test('dashboard hash alias keeps sidebar links active on canonical seo lane', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run hash alias active-state smoke once on desktop');

  await page.route(/\/api\/users\/me\?populate=role$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 62,
        username: 'admin-user',
        email: 'admin@example.com',
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
            locales_total: 1,
            reference_locale: 'en',
            locales_complete: 1,
            locales_with_gaps: 0,
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
        build_sha7: 'seoalias',
        build_sha_full: 'seoaliasdeadbeef',
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
        username: 'admin-user',
        email: 'admin@example.com',
        confirmed: true,
        blocked: false,
        loginAt: '2026-02-20T10:00:00.000Z',
      })
    );
  }, [MOCK_JWT]);

  await page.goto('/en/dashboard/#dashboard-control-seo');
  await dismissConsentBanner(page);

  const controlPill = page.locator('[data-dashboard-section-pill][href="#dashboard-control"]').first();
  await expect(controlPill).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#dashboard-control');

  await controlPill.click();
  await expect(
    page.locator('.desktop-tablet-column [data-auth-dashboard-link][href="/en/dashboard/#dashboard-control"]').first()
  ).toHaveClass(/is-active/);
  await expect(
    page.locator('.desktop-tablet-column [data-auth-admin-link][href="/en/dashboard/#dashboard-control"]').first()
  ).toHaveClass(/is-active/);

  await page.goto('/en/dashboard/#dashboard-reports');
  await dismissConsentBanner(page);
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#dashboard-editorial-reports');
  await expect(
    page.locator('.desktop-tablet-column [data-auth-admin-link][href="/en/dashboard/#dashboard-editorial-reports"]').first()
  ).toHaveClass(/is-active/);
  await expect(page.locator('[data-dashboard-section-pill][href="#dashboard-editorial-moderation"]').first()).toHaveClass(
    /is-active/
  );
});

test('dashboard auth mode keeps site navigation header-only', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run dashboard auth shell check once on desktop');

  await page.route(/\/api\/users\/me\?populate=role$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 61,
        username: 'dashboard-member',
        email: 'dashboard-member@example.com',
        confirmed: true,
        blocked: false,
        createdAt: '2026-02-01T10:20:00.000Z',
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
        build_sha7: 'authnav1',
        build_sha_full: 'authnav1deadbeef',
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
        username: 'dashboard-member',
        email: 'dashboard-member@example.com',
        confirmed: true,
        blocked: false,
        loginAt: '2026-02-20T10:00:00.000Z',
      })
    );
  }, [MOCK_JWT]);

  await page.goto('/en/dashboard/');
  await dismissConsentBanner(page);

  await expect(page.locator('html')).toHaveClass(/shell-dashboard-auth/);

  const desktopSidebarNav = page.locator('.desktop-tablet-column .app-nav');
  const mobileDrawerNav = page.locator('.mobile-drawer-nav');
  await expect(desktopSidebarNav).toHaveCount(0);
  await expect(mobileDrawerNav).toHaveCount(0);

  await expect(page.locator('.desktop-tablet-column [data-auth-dashboard-shell]').first()).toBeVisible();
  await expect(
    page.locator('.desktop-tablet-column [data-auth-dashboard-link][href="/en/dashboard/#dashboard-member"]').first()
  ).toBeVisible();
});
