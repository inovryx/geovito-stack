# Geovito Frontend (Astro)

Bu frontend Strapi'den read-only veri alir ve dil durum modelini uygular.

UI metinleri dosya tabanli i18n ile yonetilir (`src/i18n/*.json`).

## Diller
- `/en`
- `/de`
- `/es`
- `/ru`
- `/zh-cn`

## Sayfalar
- Home: `/:lang/`
- Atlas place: `/:lang/atlas/:slug/`
- Blog list: `/:lang/blog/`
- Blog post: `/:lang/blog/:slug/`
- System pages: `/:lang/about/`, `/:lang/rules/`, `/:lang/help/`

## Local Run
```bash
cd frontend
npm install
npm run dev
npm run i18n:check
npm run i18n:export
```

Kok rota (`/`) dil secimi onceligi:
1. Kullanici secimi (`localStorage`)
2. Browser dili (destekleniyorsa)
3. `en`

## Cloudflare Pages
Monorepo settings:
- Root directory: `frontend`
- Build command: `npm ci && npm run i18n:check && npm run build`
- Build output directory: `dist`
- Node version: `20`

Gerekli env:
- `STRAPI_URL`
- `STRAPI_API_TOKEN` (opsiyonel, public read aciksa bos kalabilir)
- `PUBLIC_SITE_URL`

Local Pages build gate:
```bash
cd /home/ali/geovito-stack
bash tools/pages_build_check.sh
```
