# Geovito Clean Rebuild Architecture

## 1) Canli Mimari (Live)
- `app/`: Strapi (canonical CMS + API)
- `frontend/`: Astro frontend (Cloudflare Pages-ready)
- `services/search-indexer/`: bagimsiz search katmani (domain-aware)

Destekleyici dokumanlar:
- `CORE_CONTRACT.md`
- `LANGUAGE_SYSTEM.md`
- `SEARCH_SYSTEM.md`
- `SUGGESTIONS_SYSTEM.md`

## 2) Mock Katmani
Mock veri sadece Strapi icinde tutulur ve tamaminda `mock=true` vardir.

Komutlar:
```bash
cd /home/ali/geovito-stack
ALLOW_MOCK_SEED=true bash tools/mock_data.sh seed
bash tools/mock_data.sh clear
bash tools/purge_mock.sh
```

Mock seti su domainleri doldurur:
- Atlas: 3 mock ulke (Turkiye, United States, Germany) + 1 non-mock pilot (Italy Pilot)
- Blog: 2 post
- UI pages: home/about/rules/help
- Suggestion: 2 moderasyon ornegi (`status=new`)
- Gazetteer/import tablolari: metadata seviyesinde ornek kayitlar

## 3) Import Bekleyen Alan (Dormant)
- `import-interface/contracts/atlas-import.v1.schema.json`: resmi import kontrati
- `import-interface/examples/atlas-import.v1.mock.json`: ornek payload
- `import-interface/adapters/`: gelecekteki import adapter baglanti noktasi

Bu repoda aktif import execution YOK:
- cron YOK
- worker YOK
- `tools/run_import.sh` bilerek devre disi

## 4) Domain Ayrimi
### Core CMS (Strapi)
- Icerik modelleri
- Dil durum modeli (`missing | draft | complete`)
- Editorial kontrol

### Atlas Domain
- `api::atlas-place.atlas-place`
- `place_id` merkezli model
- `country/admin_area/city/district`
- Otomatik publish yok
- Index yalnizca `complete`

### Blog Domain
- `api::blog-post.blog-post`
- Atlas'tan bagimsiz
- `related_places` opsiyonel
- Atlas'i override etmez

### System/UI Domain
- `api::ui-page.ui-page`
- Home, About, Rules, Help
- UI metinleri dosya bazli i18n (`frontend/src/i18n/*.json`)

### Search Domain
- `services/search-indexer/` Strapi'den ayridir
- Atlas ve Blog arama dokumanlari ayrik tasarlanir
- Kontratlar: `services/search-indexer/contracts/`

### Suggestion Domain
- `api::atlas-suggestion.atlas-suggestion`
- Kullanici/editor onerileri Atlas kaydina dogrudan yazilmaz
- Moderasyon state machine: `new -> triaged -> accepted/rejected -> implemented`
- `accepted` sonrasinda Atlas degisiklikleri manuel uygulanir

### AI Domain (Flag-Gated)
- `api/ai` endpointleri local-only policy ile korunur
- Varsayilan kapali: `AI_ENABLED=false`
- AI ciktilari draft/diagnostic seviyesindedir
- Atlas auto-mutate/publish yapamaz
- Her AI cagrisi `logs/ai/ai-audit.*` dosyalarina audit yazar

### Import Interface (Dormant)
- `api::gazetteer-entry.gazetteer-entry`
- `api::import-batch.import-batch`
- Kontrat hazir, execution kapali

## 5) Dil Durum Modeli
Her icerik icin `translations[]` alaninda her dil kaydinda:
- `status`: `missing | draft | complete`
- `runtime_translation`: on-demand UI gostergesi
- `indexable`: backend kuraliyla normalize edilir

Kurallar:
- Sadece `complete` indexlenebilir
- Runtime/on-demand gorunumler `noindex`
- Canonical URL her zaman complete varyanta gider

## 6) Astro Davranisi
- Namespace: `/en /de /es /ru /zh-cn`
- Hreflang uretimi aktif
- Strapi disinda data kaynagi yok
- Incomplete/missing dilde fallback + banner
- `?translate=1` ile on-demand ceviri UI (noindex)
- Kok rota dil secimi: user secimi -> browser dili -> en
- Sitemap yapisi: `sitemap.xml` (index) + `sitemaps/atlas-<lang>-<chunk>.xml`

## 7) Klasor Yapisi
```text
geovito-stack/
  app/                      # Strapi CMS/API
    src/api/
      atlas-place/
      atlas-suggestion/
      ai/
      blog-post/
      ui-page/
      gazetteer-entry/
      import-batch/
    src/components/shared/
      localized-content.json
    src/modules/
      ai/
      domain-logging/
      language-state/
      mock-data/
      suggestions/
    scripts/manage_mock_data.js
  frontend/                 # Astro web app
    src/i18n/              # UI language files (JSON)
    src/pages/
    src/lib/
    scripts/i18n_workflow.mjs
  services/search-indexer/
    contracts/             # domain search contracts
  import-interface/         # Dormant import contract boundary
    contracts/
    examples/
    adapters/
  import-workspace/         # Future isolated import operations scaffold (design-only)
    contracts/
    profiles/
    scripts/
  tools/
    run_import.sh           # intentionally disabled
```

## 8) Live vs Mock vs Waiting Ozeti
- Live: Strapi API + Astro rendering + language-state enforcement
- Mock: atlas/blog/ui/gazetteer/import-batch test verileri
- Waiting: gercek gazetteer import execution pipeline
