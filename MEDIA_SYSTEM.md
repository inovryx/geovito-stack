# Geovito Media System (WebP-First)

Status: active baseline  
Scope: upload images, frontend image delivery rules, OG/social preview policy

## 1) Policy Decision (Locked)
- Content images: `webp-first`
- Social preview images (Open Graph/Twitter): `jpeg` fallback
- AVIF is not baseline in current production profile

Reasoning:
- WebP gives strong compression with broad real-device/browser compatibility.
- JPEG for OG avoids crawler/client edge issues in social share previews.

## 2) Backend Upload Flow
Source path:
- `app/src/middlewares/mediapipeline.js`

Behavior:
- Upload routes are intercepted (`/api/upload`, `/upload`).
- Convertible mimes: `image/jpeg`, `image/jpg`, `image/png`.
- Converted output: `image/webp` only.
- Existing WebP uploads are kept as-is (no forced recompress).

Key runtime env:
- `MEDIA_IMAGE_CONVERT_ENABLED=true|false`
- `MEDIA_IMAGE_TARGET_FORMAT=webp`
- `MEDIA_IMAGE_QUALITY=35..95`
- `MEDIA_IMAGE_MAX_INPUT_BYTES` (conversion input cap)
- `MEDIA_IMAGE_CONVERT_STRICT=true|false`

Guardrail:
- If `MEDIA_IMAGE_TARGET_FORMAT` is set to non-supported value, middleware forces `webp` and logs warning.

## 3) Frontend Delivery Notes
- Atlas/blog/system pages render media URLs from Strapi response.
- For SEO/social preview, default fallback is:
  - `frontend/public/og-default.jpg`
- Layout-level OG/Twitter tags use that fallback when specific OG image is not set.

## 4) Input/Output Matrix
- JPG upload -> WebP stored/delivered
- PNG upload -> WebP stored/delivered
- WebP upload -> WebP stored/delivered
- GIF/SVG/other -> not converted by media pipeline (policy keeps conversion scope narrow)

## 5) Operational Checks
Primary guard:
```bash
cd /home/ali/geovito-stack
bash tools/media_policy_check.sh
```

This verifies:
- conversion enabled
- target format is `webp`
- default OG JPEG exists

## 6) Known Constraints
- Conversion middleware is upload-time only; legacy old-format assets stay old until re-upload/reprocess.
- Animated and vector media are intentionally outside current conversion scope.
- OG image quality and dimensions should be curated manually (recommended 1200x630 JPEG).

## 7) Next Step (When Needed)
Optional authenticated smoke check:
```bash
STRAPI_API_TOKEN=... bash tools/media_upload_smoke.sh
```

This uploads a tiny fixture image and verifies:
- returned mime is `image/webp`
- returned ext is `.webp`

Cleanup runs by default (set `MEDIA_SMOKE_CLEANUP=false` to keep the asset).

Keep this optional to avoid opening public upload permissions.
