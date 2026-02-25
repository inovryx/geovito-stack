# Geovito Go-Live Gate (PASS/FAIL)

Use this checklist before opening broader traffic.

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
- [ ] report submission + moderation queue verified
- [ ] guest comment policy and link limits verified

## Profile + Routing
- [ ] `/{lang}/@{username}` profile routes render
- [ ] `/@{username}` redirects to localized canonical route
- [ ] profile pages are noindex and excluded from sitemap

## Final Decision
- PASS all required blocks -> Go live
- Any FAIL -> hold release, patch, rerun full gate
