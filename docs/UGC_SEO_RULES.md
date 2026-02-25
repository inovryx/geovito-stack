# Geovito UGC SEO Rules

## Non-Negotiable Baseline
Atlas/index gate contract is unchanged:
- Only indexable combinations remain indexable.
- Non-eligible variants stay `noindex,nofollow`.

## UGC SEO Matrix
UGC must satisfy both:
1. Visibility contract (site-level)
2. Indexability contract (search-level)

### Submitted (In Review)
- Can be visible on site if `site_visibility=visible`.
- Must remain `noindex,nofollow`.
- Must be excluded from sitemap.

### Approved
- Can be visible on site if `site_visibility=visible`.
- Can be indexable only if existing language/index gate conditions pass.
- Eligible URLs can appear in UGC sitemap bucket.

### Rejected/Spam/Deleted
- Must not be publicly visible.
- Must not be indexable.
- Must not appear in sitemap.

## Profile SEO
- Creator profile pages are always `noindex,nofollow`.
- Profile URLs are excluded from sitemap.
- Canonical should point to localized public profile route.

## Route Canonical Policy
- Preferred public profile canonical:
`/{lang}/@{username}/...`
- `@` alias is share-friendly entrypoint with redirect to localized canonical route.
- `/u/:username` is internal mirror/fallback and not preferred for public indexing.

## Smoke Verification
Use after deploy:
- `bash tools/post_deploy_smoke.sh`
- Optional creator checks:
`CREATOR_USERNAME=<username> CREATOR_LANG=en bash tools/post_deploy_smoke.sh`
