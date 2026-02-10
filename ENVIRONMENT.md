# ENVIRONMENT

Bu dokuman production-safe env ayrimini netlestirir.

## 1) Strapi Container Env (runtime)
Kaynak:
- `docker-compose.yml` (`strapi` service env bloklari)
- VPS local `.env` (commit edilmez)

Ornek runtime degiskenleri:
- `NODE_ENV`
- `HOST`, `PORT`
- `POSTGRES_DB`, `POSTGRES_USER`, `DB_PASS`
- `APP_KEYS`, `JWT_SECRET`, `ADMIN_JWT_SECRET`, `ENCRYPTION_KEY`
- `IMPORT_ENABLED` (default `false`, import dormant guard)
- `TRANSLATION_BUNDLE_ENABLED` (default `false`, translation bundle import guard)
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
- AI varsayilan kapali: `AI_ENABLED=false`, `AI_DIAGNOSTICS_ENABLED=false`, `AI_DRAFT_ENABLED=false`
- Import execution bu fazda kapali kalir: `tools/run_import.sh` non-zero doner
