# Geovito Embed System

Status: active baseline  
Scope: Atlas, Blog, UI pages, Region pages

## 1) Purpose
Provide a safe, provider-whitelisted video embed flow that works for:
- Atlas content translations
- Blog content translations
- UI/System page translations
- Region group translations

## 2) Data Contract
Embed items live inside `shared.localized-content` as repeatable component:
- `provider`: `youtube | facebook`
- `source_url`: absolute URL
- `title`: optional
- `caption`: optional
- `start_seconds`: optional

Strapi component:
- `app/src/components/shared/embed-item.json`

## 3) Backend Safety Rules
Validation module:
- `app/src/modules/content-embeds/index.js`

Enforced rules:
- max `8` embeds per translation
- only `http/https` accepted, normalized to `https`
- provider whitelist only (`youtube`, `facebook`)
- hostname whitelist per provider
- YouTube links must contain a valid video id
- Facebook links must contain a concrete path (not bare domain)

Validation is executed via language-state lifecycle on create/update.

## 4) Frontend Rendering Rules
Rendering component:
- `frontend/src/components/content/EmbedGallery.astro`

Resolver:
- `frontend/src/lib/embed.ts`

Rules:
- resolve only whitelisted/valid URLs
- render provider-safe embed URLs:
  - YouTube -> `https://www.youtube-nocookie.com/embed/{id}`
  - Facebook -> `https://www.facebook.com/plugins/video.php?...`
- dedupe repeated embeds
- cap rendering at `8` items
- iframe uses restrictive sandbox + strict referrer policy
- source link rendered with `rel="noopener noreferrer nofollow"`

## 5) SEO / Index Contract
Embeds do not change index gate behavior.
Indexability still follows page-level rules:
- EN + complete + mock=false -> indexable
- all others -> noindex with canonical strategy unchanged

## 6) Smoke Verification
`tools/shell_smoke_test.sh` checks:
- embed gallery token on atlas page
- YouTube embed URL pattern
- Facebook embed URL pattern
- source link `rel` policy

## 7) Out of Scope
- arbitrary iframe providers
- script-based embeds
- auto-embed from plain text
- user-custom HTML embeds
