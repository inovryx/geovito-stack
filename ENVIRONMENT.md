# ENVIRONMENT

Bu dokuman production-safe env ayrimini netlestirir.

## 1) Strapi Container Env (runtime)
Kaynak:
- `docker-compose.yml` (`strapi` service env bloklari)
- VPS local `.env` (commit edilmez)

Ornek runtime degiskenleri:
- `NODE_ENV`
- `HOST`, `PORT`
- `SERVER_URL` (absolute public URL when behind proxy/reverse-proxy)
- `IS_PROXIED` (default `true`, trust proxy headers)
- `POSTGRES_DB`, `POSTGRES_USER`, `DB_PASS`
- `APP_KEYS`, `JWT_SECRET`, `ADMIN_JWT_SECRET`, `ENCRYPTION_KEY`
- `AUTH_LOCAL_REGISTER_ENABLED` (default `true`)
- `AUTH_GOOGLE_ENABLED` (default `false`)
- `AUTH_FACEBOOK_ENABLED` (default `false`)
- `AUTH_GOOGLE_CLIENT_ID` / `AUTH_GOOGLE_CLIENT_SECRET` (provider ON iken zorunlu)
- `AUTH_FACEBOOK_CLIENT_ID` / `AUTH_FACEBOOK_CLIENT_SECRET` (provider ON iken zorunlu)
- `AUTH_GOOGLE_CALLBACK_PATH` (default `api/connect/google/callback`)
- `AUTH_FACEBOOK_CALLBACK_PATH` (default `api/connect/facebook/callback`)
- `AUTH_GOOGLE_SCOPE` (default `email`)
- `AUTH_FACEBOOK_SCOPE` (default `email`)
- `AUTH_RATE_LIMIT_WINDOW_MS` (default `60000`)
- `AUTH_RATE_LIMIT_MAX` (default `20`)
- `BLOG_COMMENT_REGISTERED_AUTO_APPROVE_AFTER` (default `2`, registered comment auto-approve threshold)
- `BLOG_COMMENT_IP_HASH_SALT` (optional; comment IP hash salt override)
- `BLOG_LIKE_IP_HASH_SALT` (optional; like IP hash salt override)
- `BLOG_LIKE_RATE_WINDOW_MS` (default `60000`)
- `BLOG_LIKE_RATE_MAX` (default `60`)
- `TURNSTILE_ENABLED` (default `false`)
- `TURNSTILE_SECRET_KEY` (only required when Turnstile enabled)
- `EMAIL_PROVIDER` (`sendmail` default, `nodemailer` for real SMTP)
- `EMAIL_DEFAULT_FROM`, `EMAIL_DEFAULT_REPLY_TO`
- `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`
- `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`
- `EMAIL_SMTP_SECURE`, `EMAIL_SMTP_REQUIRE_TLS`, `EMAIL_SMTP_IGNORE_TLS`
- `EMAIL_SMTP_POOL`, `EMAIL_SMTP_MAX_CONNECTIONS`, `EMAIL_SMTP_MAX_MESSAGES`
- `EMAIL_SMTP_REJECT_UNAUTHORIZED`
- `UPLOAD_MAX_FILE_SIZE_BYTES` (default `8388608`, 8 MB)
- `UPLOAD_BREAKPOINT_LARGE` / `MEDIUM` / `SMALL` (responsive image breakpoints)
- `MEDIA_IMAGE_CONVERT_ENABLED` (default `true`, upload-time conversion guard)
- `MEDIA_IMAGE_TARGET_FORMAT` (default ve policy: `webp`)
- `MEDIA_IMAGE_ALLOWED_INPUT_MIME` (default `jpg,jpeg,png,webp`)
- `MEDIA_IMAGE_QUALITY` (default `82`)
- `MEDIA_IMAGE_MAX_INPUT_BYTES` (default `20971520`, 20 MB conversion limit)
- `MEDIA_IMAGE_CONVERT_STRICT` (default `false`; `true` => oversize conversion request fails)
- `IMPORT_ENABLED` (default `false`, import dormant guard)
- `TRANSLATION_BUNDLE_ENABLED` (default `false`, translation bundle import guard)
- `TRANSLATION_BUNDLE_ALLOW_STATUS_PROMOTE` (default `false`, bundle status mutations disabled)
- `AI_ENABLED`, `AI_DIAGNOSTICS_ENABLED`, `AI_DRAFT_ENABLED` (default OFF)

Kural:
- Gercek secretlar sadece local `.env` dosyasinda tutulur.
- `.env` ve `.env.*` commit edilmez.

## 2) Frontend Build Env (Astro / Pages)
Kaynak:
- Cloudflare Pages Project Settings -> Environment Variables
- `frontend/.env.example` sadece referans icindir.

Minimum gerekli degiskenler:
- `STRAPI_URL` (Strapi API base URL)
- `PUBLIC_SITE_URL` (canonical domain)
- `STRAPI_API_TOKEN` (opsiyonel; public read aciksa bos olabilir)

Auth (opsiyonel sosyal giris butonlari):
- `PUBLIC_AUTH_LOCAL_REGISTER_ENABLED` (`true`/`false`, default `true`)
- `PUBLIC_AUTH_GOOGLE_ENABLED` (`true`/`false`, default `false`)
- `PUBLIC_AUTH_FACEBOOK_ENABLED` (`true`/`false`, default `false`)
- `PUBLIC_TURNSTILE_SITE_KEY` (opsiyonel; set edilirse auth formlarinda captcha widget gorunur)
- `PUBLIC_SITE_LOCKDOWN_ENABLED` (`true`/`false`, default `false`)
- `PUBLIC_SITE_LOCKDOWN_NOTICE` (opsiyonel, test mode banner metni)

Not:
- Email/sifre kayit ve giris endpointleri Strapi `users-permissions` tarafindan servis edilir.
- Sosyal provider butonlari sadece bu flag'ler `true` ise frontend'de gorunur.
- Backend provider guardlari da acik olmali:
  - `AUTH_GOOGLE_ENABLED=true` ve/veya `AUTH_FACEBOOK_ENABLED=true`
- Turnstile aciksa (`TURNSTILE_ENABLED=true`) login/register/forgot/reset/upload endpointleri
  gecerli `cf-turnstile-response` tokeni olmadan `403` doner.
- `PUBLIC_SITE_LOCKDOWN_ENABLED=true` ise frontend tum sayfalarda robots meta degerini `noindex,nofollow` olarak zorlar ve register/sosyal giris gorunumunu kapatir.
- Public self register kontrolu:
  - `AUTH_LOCAL_REGISTER_ENABLED=true` iken `/api/auth/local/register` acik
  - `AUTH_LOCAL_REGISTER_ENABLED=false` iken register endpoint `403` doner
  - `PUBLIC_AUTH_LOCAL_REGISTER_ENABLED=false` ise frontend register formu gizlenir
- Sosyal login acilacaksa provider callback URL'leri domain ile birebir eslesmelidir:
  - `https://geovito.com/api/connect/google/callback`
  - `https://geovito.com/api/connect/facebook/callback`

OAuth provider config apply:
```bash
cd /home/ali/geovito-stack
bash tools/oauth_provider_apply.sh --dry-run
bash tools/oauth_provider_apply.sh
PUBLIC_SITE_URL=https://geovito.com bash tools/oauth_config_check.sh
```

Not:
- `tools/oauth_provider_apply.sh` Strapi `users-permissions` grant store kaydini env degerleri ile gunceller.
- `.env` degistirdiysen `REFRESH_STRAPI_ENV=1` ile container env yenilemesi yap.

SMTP config check:
```bash
cd /home/ali/geovito-stack
bash tools/smtp_config_check.sh
```

Password reset smoke:
```bash
cd /home/ali/geovito-stack
RESET_SMOKE_EMAIL=you@example.com bash tools/password_reset_smoke.sh
```

## 3) Cloudflare Pages Mapping
Project build config:
- Root directory:
  - `frontend`
- Build command:
  - `npm ci && npm run i18n:check && npm run build`
- Build output directory:
  - `dist`
- Node version:
  - `20`

## 4) Local Verification (copy/paste)
```bash
cd /home/ali/geovito-stack
bash tools/pages_build_check.sh
```

## 5) Safety Notes
- Mock seed varsayilan kapali: `SEED_MOCK_ON_BOOT=false`
- Import varsayilan kapali: `IMPORT_ENABLED=false`
- Translation bundle import varsayilan kapali: `TRANSLATION_BUNDLE_ENABLED=false`
- Translation bundle status promote varsayilan kapali: `TRANSLATION_BUNDLE_ALLOW_STATUS_PROMOTE=false`
- AI varsayilan kapali: `AI_ENABLED=false`, `AI_DIAGNOSTICS_ENABLED=false`, `AI_DRAFT_ENABLED=false`
- Import execution bu fazda kapali kalir: `tools/run_import.sh` non-zero doner
- Upload image pipeline varsayilan olarak acik: JPG/PNG dosyalari upload sirasinda `webp` dosyasina cevrilir.
- Sosyal/OG fallback politikasi: paylasim meta gorseli `jpeg` olmalidir (`frontend/public/og-default.jpg`).
- Media policy detaylari: `MEDIA_SYSTEM.md`
