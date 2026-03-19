# Dashboard Checklist (MVP Freeze)

## Scope
- Goal: stabilize dashboard as first production baseline (header-only site nav, role-aware sidebar, deterministic lane/hash routing).
- Constraint: Clean Core remains unchanged. Dashboard stays UI/control surface only.

## Information Architecture
- Header (global): site navigation/search/theme.
- Left panel (dashboard auth mode): ordered blocks:
  1. `Dashboard modules`
  2. `Session`
  3. `Workspace`
  4. `Admin tools` (editor/admin/owner only)
- Center panel: role-aware lanes (`member`, `editorial`, `control`) and module sections.
- Right panel: tools column remains enabled in dashboard route.

## Role Matrix (Locked)
- Member:
  - Modules: General, Settings
  - Workspace: Dashboard, Account, Open my comment queue
  - Admin tools: hidden
- Editor:
  - Member + Moderation, Translation
  - Workspace: + Open translation progress
- Admin:
  - Editor + SEO, Ads, Open Strapi admin
- Owner:
  - Admin + owner widgets (release/moderation/locale)

## Menu Modules (Focus Mode Ready)
- Top modules: `Account`, `Content`, `Community`, `Ops`, `Admin`
- Sub-section mapping:
  - `Account`: `#dashboard-member`, `#dashboard-member-settings`
  - `Content`: `#dashboard-editorial-moderation`, `#dashboard-editorial-reports`, `#dashboard-editorial-account-requests`
  - `Community`: `#dashboard-editorial-locale`, `#dashboard-member-follow`, `#dashboard-member-notifications`, `#dashboard-member-saved-lists`
  - `Ops`: `#dashboard-control`, `#dashboard-control-ads`
  - `Admin`: `#dashboard-admin-release`, `#dashboard-admin-moderation`, `#dashboard-admin-locale`
- Persistence keys:
  - `geovito_dashboard_focus_mode_v1`
  - `geovito_dashboard_active_module_v1`
  - `geovito_dashboard_last_subsection_v1`
- Init precedence:
  1. URL hash
  2. persisted last subsection
  3. persisted/selected top-module default subsection
  4. role fallback (`#dashboard-member`)

## Hash Alias Map (Locked)
- `#dashboard-general` -> `#dashboard-member`
- `#dashboard-settings` -> `#dashboard-member-settings`
- `#dashboard-moderation` -> `#dashboard-editorial-moderation`
- `#dashboard-reports` -> `#dashboard-editorial-reports`
- `#dashboard-account-requests` -> `#dashboard-editorial-account-requests`
- `#dashboard-translation` -> `#dashboard-editorial-locale`
- `#dashboard-seo` -> `#dashboard-control`
- `#dashboard-control-seo` -> `#dashboard-control`
- `#dashboard-ads` -> `#dashboard-control-ads`

## Completed
- Dashboard route enforces header-only site nav in auth mode (`shell-dashboard-auth`).
- Sidebar IA finalized with role-aware Workspace/Admin Tools separation.
- Sidebar dashboard/workspace/admin links use normalized hash matching and stay active-state synced.
- Default landing module is `#dashboard-member`; hidden/unauthorized hash targets fall back to first visible role lane.
- Section pills, module cards, URL hash, and sidebar active links run on one canonical hash state.
- Dashboard quick actions are role-gated per matrix.
- Editorial lane now includes `Report inbox` and `Account requests` moderation cards (editor/admin visible).
- Dashboard moderation actions cover comment, content-report, and account-request status updates.
- Playwright coverage includes:
  - role visibility gates
  - admin tools links open matching dashboard lanes (`moderation`, `control`, `ads`)
  - editorial inbox cards render report/account-request queues and apply moderation actions
  - fallback when requested hash lane is hidden
  - hash alias canonical behavior (`#dashboard-control-seo`)
  - header-only nav behavior on dashboard auth mode

## Verification Commands
- `bash tools/pages_build_check.sh`
- `bash tools/dashboard_activity_ui_playwright.sh`
- `docker run --rm --network=host -u "$(id -u):$(id -g)" -v "$PWD":/work -w /work/frontend mcr.microsoft.com/playwright:v1.49.1-jammy bash -lc "corepack pnpm@9.15.4 install --frozen-lockfile && corepack pnpm@9.15.4 exec playwright test tests/dashboard-activity.spec.ts --project=desktop --reporter=line"`
