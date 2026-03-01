# Geovito Go-Live Gate (PASS/FAIL)

Use this checklist before opening broader traffic.

## One-command Gate
Run:

```bash
bash tools/go_live_gate.sh
```

Useful toggles:

```bash
# include creator profile route checks in smoke
CREATOR_USERNAME=olmysweet GO_LIVE_REQUIRE_CREATOR=true bash tools/go_live_gate.sh

# skip deploy trigger and only validate current production
GO_LIVE_WITH_DEPLOY=false bash tools/go_live_gate.sh

# include SMTP reset smoke
GO_LIVE_WITH_SMTP=true RESET_SMOKE_EMAIL=you@example.com bash tools/go_live_gate.sh

# if /api/_health is token-protected
HEALTH_TOKEN=your_token_here bash tools/go_live_gate.sh

# skip report moderation smoke (not recommended for release)
GO_LIVE_SKIP_REPORT_SMOKE=true bash tools/go_live_gate.sh

# skip community settings smoke (not recommended for release)
GO_LIVE_SKIP_COMMUNITY_SETTINGS_SMOKE=true bash tools/go_live_gate.sh

# skip dashboard role baseline smoke (not recommended for release)
GO_LIVE_SKIP_DASHBOARD_ROLE_SMOKE=true bash tools/go_live_gate.sh

# skip follow/notification foundation smokes (not recommended for release)
GO_LIVE_SKIP_FOLLOW_SMOKE=true GO_LIVE_SKIP_NOTIFICATION_SMOKE=true bash tools/go_live_gate.sh
```

Optional secret-file setup for health token:

```bash
bash tools/stack_health_env_init.sh
nano ~/.config/geovito/health.env
```

## Core Infrastructure
- [ ] `bash tools/stack_health.sh` PASS
- [ ] `bash tools/prod_health.sh` PASS
- [ ] `bash tools/pages_build_check.sh` PASS

## Contract Gates
- [ ] `bash tools/pre_import_index_gate_check.sh` PASS
- [ ] `bash tools/pre_design_gate_check.sh` PASS
- [ ] Import remains dormant by default
- [ ] Translation bundle remains dormant by default
- [ ] AI flags remain OFF by default

## Deploy + Smoke
- [ ] production build fingerprint matches expected SHA
- [ ] `bash tools/smoke_access.sh` PASS
- [ ] `bash tools/post_deploy_smoke.sh` PASS

## Auth + Account
- [ ] register/login/forgot/reset flows operational
- [ ] SMTP reset smoke PASS
- [ ] account session persistence and logout verified

## UGC + Moderation
- [ ] submitted-visible posts show "In review"
- [ ] submitted-visible posts are noindex and sitemap-excluded
- [ ] approved-visible posts follow indexability gates
- [ ] `bash tools/report_moderation_smoke.sh` PASS
- [ ] `bash tools/community_settings_smoke.sh` PASS
- [ ] `bash tools/dashboard_role_smoke.sh` PASS
- [ ] `bash tools/follow_system_smoke.sh` PASS
- [ ] `bash tools/notification_preferences_smoke.sh` PASS
- [ ] guest comment policy and link limits verified

## Profile + Routing
- [ ] `/{lang}/@{username}` profile routes render
- [ ] `/@{username}` redirects to localized canonical route
- [ ] profile pages are noindex and excluded from sitemap

## Final Decision
- PASS all required blocks -> Go live
- Any FAIL -> hold release, patch, rerun full gate
