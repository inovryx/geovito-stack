import { expect, test } from '@playwright/test';

const MOCK_JWT = 'mock-jwt-token';

test('account shows my comment queue and refresh updates counts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run queue smoke once on desktop');

  let queueRequestCount = 0;
  let previewRequestCount = 0;
  let accountRequestsSubmitCount = 0;
  let savedListToggleCount = 0;
  const previewStates: string[] = [];
  const accountRequestPayloads: Array<{ request_type?: string; reason?: string }> = [];
  const savedListRows = [
    {
      list_id: 'list-main',
      slug: 'my-atlas',
      title: 'My atlas picks',
      visibility: 'private',
      updated_at: '2026-02-21T07:00:00.000Z',
    },
  ];
  const savedItems = [
    {
      item_id: 'item-1',
      list_id: 'list-main',
      target_type: 'place',
      target_ref: 'place-istanbul',
    },
    {
      item_id: 'item-2',
      list_id: 'list-main',
      target_type: 'post',
      target_ref: 'post-city-break',
    },
  ];
  const preferenceState: {
    preferred_ui_language: string;
    notifications_site_enabled: boolean;
    notifications_email_enabled: boolean;
    notifications_digest: string;
    onboarding_progress: {
      profile_completed: boolean;
      first_place_selected: boolean;
      first_post_started: boolean;
      share_prompt_seen: boolean;
      skipped: boolean;
    };
  } = {
    preferred_ui_language: 'en',
    notifications_site_enabled: true,
    notifications_email_enabled: true,
    notifications_digest: 'daily',
    onboarding_progress: {
      profile_completed: true,
      first_place_selected: true,
      first_post_started: false,
      share_prompt_seen: false,
      skipped: false,
    },
  };

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
      let payload: any = {};
      try {
        payload = route.request().postDataJSON();
      } catch {
        payload = {};
      }
      const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
      if (typeof data.preferred_ui_language === 'string') {
        preferenceState.preferred_ui_language = data.preferred_ui_language;
      }
      if (typeof data.notifications_site_enabled === 'boolean') {
        preferenceState.notifications_site_enabled = data.notifications_site_enabled;
      }
      if (typeof data.notifications_email_enabled === 'boolean') {
        preferenceState.notifications_email_enabled = data.notifications_email_enabled;
      }
      if (typeof data.notifications_digest === 'string') {
        preferenceState.notifications_digest = data.notifications_digest;
      }
      if (data.onboarding_progress && typeof data.onboarding_progress === 'object') {
        preferenceState.onboarding_progress = {
          ...preferenceState.onboarding_progress,
          ...data.onboarding_progress,
        };
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: preferenceState }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: preferenceState }),
    });
  });

  await page.route(/\/api\/community-settings\/effective$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          citizen_card_visible: true,
          badges_visible: false,
        },
      }),
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

  await page.route(/\/api\/account-requests\/me\/list/, async (route) => {
    const data =
      accountRequestsSubmitCount === 0
        ? [
            {
              request_id: 'request-001',
              request_type: 'deactivate',
              status: 'new',
              reason: 'Temporary break',
              resolution_note: null,
              created_at: '2026-02-20T08:00:00.000Z',
              resolved_at: null,
            },
            {
              request_id: 'request-002',
              request_type: 'delete',
              status: 'approved',
              reason: 'Old test request',
              resolution_note: 'Approved for final cleanup',
              created_at: '2026-02-18T08:00:00.000Z',
              resolved_at: '2026-02-19T09:00:00.000Z',
            },
          ]
        : [
            {
              request_id: 'request-003',
              request_type: 'delete',
              status: 'new',
              reason: 'Need full delete',
              resolution_note: null,
              created_at: '2026-02-21T08:00:00.000Z',
              resolved_at: null,
            },
            {
              request_id: 'request-001',
              request_type: 'deactivate',
              status: 'new',
              reason: 'Temporary break',
              resolution_note: null,
              created_at: '2026-02-20T08:00:00.000Z',
              resolved_at: null,
            },
            {
              request_id: 'request-002',
              request_type: 'delete',
              status: 'approved',
              reason: 'Old test request',
              resolution_note: 'Approved for final cleanup',
              created_at: '2026-02-18T08:00:00.000Z',
              resolved_at: '2026-02-19T09:00:00.000Z',
            },
          ];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    });
  });

  await page.route(/\/api\/account-requests\/me\/submit$/, async (route) => {
    let payload: { request_type?: string; reason?: string } = {};
    try {
      payload = route.request().postDataJSON() as { request_type?: string; reason?: string };
    } catch {
      payload = {};
    }
    accountRequestPayloads.push(payload);
    accountRequestsSubmitCount += 1;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          request_id: 'request-003',
          request_type: payload.request_type || 'delete',
          reason: payload.reason || null,
          status: 'new',
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
    savedListToggleCount += 1;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          ok: true,
          toggled: payload.action || 'unsave',
        },
      }),
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

  await expect(page.locator('[data-account-requests]')).toBeVisible();
  await expect(page.locator('[data-account-requests-new]')).toHaveText('1');
  await expect(page.locator('[data-account-requests-approved]')).toHaveText('1');
  await expect(page.locator('[data-account-requests-rejected]')).toHaveText('0');
  await expect(page.locator('[data-account-requests-completed]')).toHaveText('0');
  await expect(page.locator('[data-account-requests-list] .account-comment-item')).toHaveCount(2);
  await expect(page.locator('[data-account-requests-list]')).toContainText('request-001');

  await page.selectOption('[data-account-requests-filter]', 'approved');
  await expect(page.locator('[data-account-requests-list] .account-comment-item')).toHaveCount(1);
  await expect(page.locator('[data-account-requests-list]')).toContainText('request-002');
  await expect(page.locator('[data-account-requests-list]')).toContainText('approved');

  await page.selectOption('[data-account-requests-filter]', 'rejected');
  await expect(page.locator('[data-account-requests-list] .account-comment-item')).toHaveCount(0);
  await expect(page.locator('[data-account-requests-feedback]')).toContainText(
    'No account requests found for this filter.'
  );

  await page.selectOption('[data-account-requests-filter]', 'all');
  await page.selectOption('[data-account-request-type]', 'delete');
  await page.fill('[data-account-request-reason]', 'Need full delete');
  await page.click('[data-account-requests-submit]');
  await expect.poll(() => accountRequestsSubmitCount).toBe(1);
  await expect
    .poll(() => accountRequestPayloads[0] || {})
    .toMatchObject({ request_type: 'delete', reason: 'Need full delete' });
  await expect(page.locator('[data-account-request-reason]')).toHaveValue('');
  await expect(page.locator('[data-account-requests-new]')).toHaveText('2');
  await expect(page.locator('[data-account-requests-approved]')).toHaveText('1');
  await expect(page.locator('[data-account-requests-list]')).toContainText('request-003');
  await expect(page.locator('[data-account-saved-lists]')).toBeVisible();
  await expect(page.locator('[data-account-saved-lists-total-lists]')).toHaveText('1');
  await expect(page.locator('[data-account-saved-lists-total-items]')).toHaveText('2');
  await expect(page.locator('[data-account-saved-lists-total-posts]')).toHaveText('1');
  await expect(page.locator('[data-account-saved-lists-total-places]')).toHaveText('1');
  await expect(page.locator('[data-account-saved-lists-list]')).toContainText('My atlas picks');
  await expect(page.locator('[data-account-saved-lists-list]')).toContainText('place-istanbul');
  await expect(page.locator('[data-account-saved-lists-list] [data-account-saved-item-remove]')).toHaveCount(2);
  await expect(page.locator('[data-account-saved-lists-list] a[href="/en/atlas/place-istanbul/"]')).toHaveCount(1);
  await page.click('[data-account-saved-item-remove][data-target-ref="place-istanbul"]');
  await expect.poll(() => savedListToggleCount).toBe(1);
  await expect(page.locator('[data-account-saved-lists-total-items]')).toHaveText('1');
  await expect(page.locator('[data-account-saved-lists-total-posts]')).toHaveText('1');
  await expect(page.locator('[data-account-saved-lists-total-places]')).toHaveText('0');
  await expect(page.locator('[data-account-saved-lists-list]')).not.toContainText('place-istanbul');
  await expect(page.locator('[data-account-saved-lists-list]')).toContainText('post-city-break');
  await expect(page.locator('[data-account-community-citizen-card]')).toContainText('Enabled');
  await expect(page.locator('[data-account-community-badges]')).toContainText('Disabled');
  await expect(page.locator('[data-account-onboarding-status]')).toContainText('In progress');
  await expect(page.locator('[data-account-onboarding-progress]')).toContainText('50%');
  await expect(page.locator('[data-account-onboarding-completed]')).toContainText('2/4');
  await page.check('[data-account-onboarding-first-post-started]');
  await page.click('[data-account-onboarding-form] button[type="submit"]');
  await expect(page.locator('[data-account-onboarding-feedback]')).toContainText('saved');
  await expect(page.locator('[data-account-onboarding-progress]')).toContainText('75%');
  await expect(page.locator('[data-account-onboarding-completed]')).toContainText('3/4');

  await expect(page.locator('[data-account-language-select] option[value="tr"]')).toHaveText('TR · 12');
  await page.selectOption('[data-account-language-select]', 'tr');
  await expect(page.locator('[data-account-language-health]')).toContainText('12');
  await expect(page.locator('[data-account-locale-progress-active-filter]')).toContainText('All');
  await expect(page.locator('[data-account-locale-progress-filtered-total]')).toHaveText('12');
  await expect(page.locator('[data-account-locale-deploy-hint]')).toBeVisible();
  await expect(page.locator('[data-account-locale-deploy-command]')).toContainText('bash tools/ui_locale_sync.sh');
  await expect(page.locator('[data-account-locale-release-command]')).toContainText(
    'bash tools/release_deploy_smoke.sh --with-moderation'
  );
  await expect(page.locator('[data-account-locale-workflow-command]')).toContainText(
    'bash tools/ui_locale_sync.sh && EXPECTED_SHA7=$(git rev-parse --short=7 HEAD) bash tools/release_deploy_smoke.sh --with-moderation'
  );
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

test('account commentState query pre-filters comment queue and focuses comments section', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run queue query-filter smoke once on desktop');

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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { preferred_ui_language: 'en' } }),
    });
  });

  await page.route(/\/api\/community-settings\/effective$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          citizen_card_visible: true,
          badges_visible: false,
        },
      }),
    });
  });

  await page.route(/\/api\/blog-comments\/me\/list/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            comment_id: 'comment-pending',
            body: 'Pending comment body',
            language: 'en',
            source: 'registered',
            status: 'pending',
            blog_post_ref: 'post-city-queue',
            moderation_notes: null,
            created_at: '2026-02-20T12:00:00.000Z',
            updated_at: '2026-02-20T12:00:00.000Z',
          },
          {
            comment_id: 'comment-approved',
            body: 'Approved comment body',
            language: 'en',
            source: 'registered',
            status: 'approved',
            blog_post_ref: 'post-city-queue',
            moderation_notes: 'Approved',
            created_at: '2026-02-20T11:00:00.000Z',
            updated_at: '2026-02-20T11:05:00.000Z',
          },
        ],
        meta: {
          limit: 30,
          status: 'all',
          counts: {
            pending: 1,
            approved: 1,
            rejected: 0,
            spam: 0,
            deleted: 0,
          },
        },
      }),
    });
  });

  await page.route(/\/api\/account-requests\/me\/list/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route(/\/api\/ui-locales\/meta\/progress/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          summary: {
            locales_total: 1,
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

  await page.route(/\/api\/user-saved-lists\/me\/lists\?limit=200$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          items: [],
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
          items: [],
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
      loginAt: '2026-02-20T12:10:00.000Z',
    };
    localStorage.setItem('geovito_auth_session', JSON.stringify(payload));
  }, [MOCK_JWT]);

  await page.goto('/en/account/?commentState=pending#comments');

  await expect(page.locator('[data-account-comments]')).toBeVisible();
  await expect(page.locator('[data-account-comments]')).toHaveClass(/account-comments-focus/);
  await expect(page.locator('[data-account-comments-filter]')).toHaveValue('pending');
  await expect(page.locator('[data-account-comments-list] .account-comment-item')).toHaveCount(1);
  await expect(page.locator('[data-account-comments-list]')).toContainText('pending');
  await expect(page.locator('[data-account-comments-list]')).not.toContainText('approved');

  await page.selectOption('[data-account-comments-filter]', 'all');
  await expect(page.locator('[data-account-comments]')).not.toHaveClass(/account-comments-focus/);
  await expect(page.locator('[data-account-comments-list] .account-comment-item')).toHaveCount(2);
});

test('account requestState query pre-filters account requests list', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Run requestState query-filter smoke once on desktop');

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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { preferred_ui_language: 'en' } }),
    });
  });

  await page.route(/\/api\/community-settings\/effective$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          citizen_card_visible: true,
          badges_visible: false,
        },
      }),
    });
  });

  await page.route(/\/api\/blog-comments\/me\/list/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [],
        meta: { counts: { pending: 0, approved: 0, rejected: 0, spam: 0, deleted: 0 } },
      }),
    });
  });

  await page.route(/\/api\/account-requests\/me\/list/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            request_id: 'request-new',
            request_type: 'deactivate',
            status: 'new',
            reason: 'Short break',
            resolution_note: null,
            created_at: '2026-02-20T08:00:00.000Z',
            resolved_at: null,
          },
          {
            request_id: 'request-approved',
            request_type: 'delete',
            status: 'approved',
            reason: 'Final removal',
            resolution_note: 'Approved',
            created_at: '2026-02-19T08:00:00.000Z',
            resolved_at: '2026-02-20T09:00:00.000Z',
          },
        ],
      }),
    });
  });

  await page.route(/\/api\/ui-locales\/meta\/progress/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          summary: {
            locales_total: 1,
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

  await page.addInitScript(([jwt]) => {
    const payload = {
      jwt,
      username: 'olmysweet',
      email: 'ali.koc.00@gmail.com',
      confirmed: true,
      blocked: false,
      loginAt: '2026-02-20T12:10:00.000Z',
    };
    localStorage.setItem('geovito_auth_session', JSON.stringify(payload));
  }, [MOCK_JWT]);

  await page.goto('/en/account/?requestState=approved#account-requests');

  await expect(page.locator('[data-account-requests]')).toBeVisible();
  await expect(page.locator('[data-account-requests-filter]')).toHaveValue('approved');
  await expect(page.locator('[data-account-requests-list] .account-comment-item')).toHaveCount(1);
  await expect(page.locator('[data-account-requests-list]')).toContainText('request-approved');
  await expect(page.locator('[data-account-requests-list]')).not.toContainText('request-new');

  await page.selectOption('[data-account-requests-filter]', 'all');
  await expect(page.locator('[data-account-requests-list] .account-comment-item')).toHaveCount(2);
});
