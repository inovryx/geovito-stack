# Geovito Community System

## Scope
This document defines the UGC/community contract layered on top of Clean Core.

- Atlas remains authoritative.
- UGC extends discovery and community features.
- UGC never overrides Atlas source-of-truth records.

## Core State Axes
UGC post behavior is split across two independent axes:

1. Moderation state (`submission_state`):
`draft -> submitted -> approved|rejected|spam|deleted`
2. Site visibility (`site_visibility`):
`visible|hidden`

Guard:
- `rejected|spam|deleted` are always treated as hidden.

## Visibility vs Indexability
- `submitted + visible` can be shown in site UI with an "In review" badge.
- `submitted` content is always `noindex,nofollow` and excluded from sitemap.
- `approved + visible` can become indexable only if existing language/index gates pass.

## Models (Current Foundation)
- `creator-profile`:
owner identity, username, display metadata, visibility, citizen-card toggle.
- `blog-post` UGC extension:
`content_source`, `owner_*`, `submission_state`, `site_visibility`, `original_language`, moderation metadata.
- `blog-comment` extension:
guest/member split, reply threading fields, moderation fields.
- `community-setting` (single type):
central policy controls for guest comments, link policy, moderation strictness, visibility defaults.
- `content-report`:
post/comment/photo/profile reporting and moderation lifecycle.
- `account-request`:
deactivate/delete request flow for owner-managed account actions.
- `blog-post-revision`:
snapshot audit trail for post revisions.

## Creator Username Policy
- `creator-profile.username` is immutable after first profile creation.
- Reserved names are blocked for new profile creation (default set includes:
`admin, root, support, help, api, owner, system, geovito, www, mail, cdn`).
- Optional override:
`CREATOR_RESERVED_USERNAMES=name1,name2,...`

## Permission Baseline
- Public:
read public profiles and visible/eligible posts.
- Member:
manage own drafts/profile, submit content, engage (comment/helpful/like where enabled).
- Editor/Moderator:
moderation queues and state transitions.
- Admin/Owner:
full moderation plus community settings and high-risk controls.

## Route Strategy
- Canonical public profile routes:
`/{lang}/@{username}/`, `/{lang}/@{username}/posts/`, `/{lang}/@{username}/about/`
- Share alias:
`/@{username}` -> 307 redirect to localized canonical route.
- Internal mirror:
`/u/{username}/...` remains available as technical fallback/mirror.

## Feature Flags / Safe Defaults
- Keep high-risk capabilities feature-flagged.
- Keep dormant import/translation/AI guards unchanged by default.
- Respect existing gate scripts and release checks before rollout.
