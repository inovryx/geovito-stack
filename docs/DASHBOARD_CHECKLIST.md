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

## Hash Alias Map (Locked)
- `#dashboard-general` -> `#dashboard-member`
- `#dashboard-settings` -> `#dashboard-member-settings`
- `#dashboard-moderation` -> `#dashboard-editorial-moderation`
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
- Playwright coverage includes:
  - role visibility gates
  - fallback when requested hash lane is hidden
  - hash alias canonical behavior (`#dashboard-control-seo`)
  - header-only nav behavior on dashboard auth mode

## Verification Commands
- `bash tools/pages_build_check.sh`
- `docker run --rm --network=host -u "$(id -u):$(id -g)" -v "$PWD":/work -w /work/frontend mcr.microsoft.com/playwright:v1.49.1-jammy bash -lc "corepack pnpm@9.15.4 install --frozen-lockfile && corepack pnpm@9.15.4 exec playwright test tests/dashboard-activity.spec.ts --project=desktop --reporter=line"`
