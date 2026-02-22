# Permissions Plan (Clean Core)

## Public Role
Public role is read-only and minimal.

Allowed:
- `atlas-place`: `find`, `findOne`
- `atlas-place`: editorial checklist helper (`GET /api/atlas-places/:placeId/editorial-checklist`)
- `blog-post`: `find`, `findOne`
- `creator-profile`: `find`, `findOne` (public visibility rows only)
- `creator-profile`: public read endpoints:
  - `GET /api/creators`
  - `GET /api/creators/:username`
  - `GET /api/creators/:username/posts`
- `blog-comment`: `find`, `findOne` (approved-only via controller filter)
- `blog-comment`: custom submit endpoint (`POST /api/blog-comments/submit`, `auth=false`)
- `blog-like`: public count endpoint (`GET /api/blog-likes/count/:postId`)
- `blog-like`: toggle endpoint is route-level public (`auth=false`) but controller enforces valid Bearer JWT
- `ui-page`: `find`, `findOne`
- `ui-page` editorial meta endpoints (`/api/ui-pages/meta/*`): no public access
- `ui-locale`: no public access (build-time export only via admin token)
- `user-preference`: no public access
- `atlas-suggestion`: only custom submit endpoint (`POST /api/atlas-suggestions/submit`, `auth=false` route)
- `ai`: no public access (flags OFF => policy-level 403)

Not allowed:
- Any create/update/delete on Atlas, Blog, UI, Gazetteer, Import Batch
- Public cannot call owner/editor UGC blog routes:
  - `POST /api/blog-posts/me/draft`
  - `PUT /api/blog-posts/me/draft/:postId`
  - `POST /api/blog-posts/me/submit/:postId`
  - `GET /api/blog-posts/me/list`
  - `GET /api/blog-posts/moderation/list`
  - `POST /api/blog-posts/moderation/set`
- Public cannot toggle likes without valid Bearer JWT (`POST /api/blog-likes/toggle` -> `401`)
- Direct mutation of Atlas data from public users
- Any public access to `POST /api/ai/diagnostics` or `POST /api/ai/draft`
- Any public write endpoint other than `POST /api/atlas-suggestions/submit`
- Public media upload endpoints (`/api/upload`, `/upload`) remain disabled
- Blog comment status transitions are lifecycle-guarded server-side:
  - illegal status jumps are blocked even if a direct API call is attempted.
- Guest comment captcha is optional and env-driven:
  - `TURNSTILE_ENABLED=true` + `BLOG_COMMENT_GUEST_TURNSTILE_REQUIRED=true`

## Authenticated Role
- Default same as Public.
- If user accounts are enabled later, keep Atlas writes restricted to editorial/admin roles.
- In-site blog likes do not require additional role permission toggles; controller validates JWT directly.
- Auth endpoints are runtime-guarded:
  - `AUTH_LOCAL_REGISTER_ENABLED` controls public register endpoint.
  - `AUTH_GOOGLE_ENABLED` / `AUTH_FACEBOOK_ENABLED` control social connect routes.
  - auth requests are rate-limited by `AUTH_RATE_LIMIT_WINDOW_MS` + `AUTH_RATE_LIMIT_MAX`.
- Authenticated users can access:
  - `GET /api/user-preferences/me`
  - `PUT /api/user-preferences/me`
  These endpoints only read/write the caller's own preference record.
- Authenticated users can access UGC owner routes when enabled:
  - `GET /api/creator-profile/me`
  - `PUT /api/creator-profile/me`
  - `POST /api/blog-posts/me/draft`
  - `PUT /api/blog-posts/me/draft/:postId`
  - `POST /api/blog-posts/me/submit/:postId`
  - `GET /api/blog-posts/me/list`
  - Guard: `UGC_POST_WRITE_ENABLED=false` by default.

## Admin Panel
- Super Admin: full access
- Editor: moderation + content editing, no schema management
- Editor/Admin can use UGC moderation routes:
  - `GET /api/blog-posts/moderation/list`
  - `POST /api/blog-posts/moderation/set`
- Blog comment moderation transitions must follow lifecycle rules:
  - `pending -> approved|rejected|spam|deleted`
  - `approved -> rejected|spam|deleted`
  - `rejected -> approved|deleted`
  - `spam -> rejected|deleted`
  - `deleted` is terminal
- AI endpoints are intended for admin/editor operators via local-only policy + feature flags

## Setup Steps
1. Open `Settings > Users & Permissions Plugin > Roles > Public`.
2. Enable only `find/findOne` for `atlas-place`, `blog-post`, `ui-page`.
3. Keep `blog-comment` and `blog-like` create/update/delete disabled on Public role.
4. Keep custom endpoint behavior:
   - `POST /api/blog-comments/submit` is route-level public (`auth=false`), no role create permission needed.
   - `POST /api/blog-likes/toggle` remains route-level `auth=false` but must require valid Bearer JWT in controller.
5. Keep Atlas write actions disabled for non-admin roles.
6. Keep AI routes local-only and feature-flag gated (`AI_*` env vars).
