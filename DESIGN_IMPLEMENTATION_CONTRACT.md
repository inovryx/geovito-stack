# DESIGN IMPLEMENTATION CONTRACT

Bu kontrat, tasarim/UX degisiklikleri yapilirken cekirdegin bozulmamasini zorunlu kilar.

## 1) Zorunlu Gate
Her tasarim PR degisikligi sonrasi su komut PASS olmalidir:

```bash
cd /home/ali/geovito-stack
bash tools/pre_design_gate_check.sh
```

## 2) Degistirilmemesi Gereken Davranislar
- Index gate kurali:
  - `mock=true` => `noindex,nofollow` + `MOCK` banner
  - `missing/draft` => `noindex,nofollow` + `DRAFT/MISSING` banner
  - sadece `complete + mock=false` indexlenebilir
- Sitemap filtreleme:
  - sadece `complete + mock=false` URL'ler sitemap'e girer
- Canonical davranisi:
  - incomplete dil varyantlari canonical olarak best complete varyanta isaret eder
- Import:
  - `tools/run_import.sh` dormant kalir (non-zero)
  - `tools/import_dormant_check.sh` PASS olmali
  - `tools/import_log_sanity_check.sh` PASS olmali (`domain=import total=0`)
- Public permissions:
  - public write sadece `POST /api/atlas-suggestions/submit`
  - Atlas/Blog/UI direct public write yasak

## 3) I18n Degisiklik Kurali
- UI stringleri sadece `frontend/src/i18n/*.json` icine eklenir.
- Key yapisi tum dillerde ayni kalir.
- Degisiklik sonrasi:
  - `npm run i18n:check` PASS olmalidir.

## 4) Yasaklar
- Real import execution acmak
- Cron/import worker eklemek
- AI endpointlerini varsayilan ON yapmak
- Core contract'i dolayli olarak gevseten "quick fix" yaklasimlari
