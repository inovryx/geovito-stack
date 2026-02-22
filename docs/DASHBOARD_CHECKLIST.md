# Dashboard Checklist

## Scope
- Goal: role-driven dashboard where left panel selects modules and center panel renders the selected module content.
- Constraint: Clean Core stays intact; dashboard is a UI/control surface and does not become business logic authority.

## Information Architecture
- Header (global): site navigation/search/theme only.
- Left panel (dashboard context): module navigation + workspace shortcuts + role summary.
- Center panel: module content cards (general, moderation, translation, SEO, ads, settings).
- Right panel: optional utility cards (currency/visa/flights) via existing tools column.

## Role Model
- Member: general + settings.
- Editor: member + moderation + translation.
- Admin: editor + SEO + ads + admin control links.
- Owner: admin + owner operations widgets and release-level checks.

## Completed
- Header-only global site navigation pattern is active.
- Dashboard module links in left sidebar are role-gated.
- Hash routing is stable and backward compatible:
  - Legacy hashes are mapped to canonical dashboard targets.
  - Section pill and sidebar active states stay consistent.
- General module keeps role-allowed lanes visible by default.
- Left sidebar in dashboard mode is cleaner:
  - Added dashboard session card (identity + role + account actions).
  - Language/auth blocks are hidden in authenticated dashboard context.

## Next Steps
- Unify visual hierarchy for dashboard cards (spacing, heading cadence, KPI density).
- Build explicit module panels for:
  - SEO operations
  - Ads operations
  - Moderation queue actions
  - Translation progress operations
- Add module-level empty/loading/error states with consistent patterns.
- Introduce admin-only dashboard actions map (what is visible vs executable).
- Add dashboard E2E coverage for left-sidebar module UX states.

## Release Verification
- `bash tools/pages_build_check.sh`
- `bash tools/pre_design_gate_check.sh`
- `bash tools/smoke_access.sh`
