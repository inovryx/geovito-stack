# PRE_IMPORT_GATE

Durum: Pre-import hardening checklist (import execution kapali)

## 1) Index Gate
- [ ] Complete-only indexing kurali aktif
- [ ] `mock=true` sayfalar her zaman `noindex,nofollow`
- [ ] Draft/missing dil varyantlari `noindex,nofollow`
- [ ] Incomplete dil canonical'i best complete varyanta gider

Script ile dogrulama:
- `bash tools/pre_import_index_gate_check.sh`

## 2) Sitemap Gate
- [ ] Sitemap index uretiliyor (`/sitemap.xml`)
- [ ] Sitemap chunk dosyalari uretiliyor (`/sitemaps/atlas-<lang>-<n>.xml`)
- [ ] Sadece `mock=false` + `complete` URL'ler dahil (Atlas + RegionGroup EN)
- [ ] mock URL ve non-complete dil varyantlari dislanmis

Script ile dogrulama:
- `bash tools/pre_import_index_gate_check.sh`

## 3) Purge Mock No-Trace Gate
- [ ] `tools/purge_mock.sh` basariyla calisiyor
- [ ] `atlas-place`, `blog-post`, `ui-page`, `atlas-suggestion`, `gazetteer-entry`, `import-batch` icin `mock=true` sayisi 0
- [ ] Purge sonrasi onceki mock atlas route'lari build ciktisinda uretilmiyor

Script / komut:
- `bash tools/purge_mock.sh`
- DB count sorgusu (RUNBOOK referansi)
- `bash tools/prod_smoke_frontend.sh`

## 4) Security & Permissions Gate
- [ ] Public write kilidi korunuyor (yalniz suggestion submit acik)
- [ ] AI endpointleri varsayilan `403` (flags OFF)
- [ ] Strapi yalniz `127.0.0.1` bind

Script ile dogrulama:
- `bash tools/prod_health.sh`

## 5) Import Dormancy Gate
- [ ] Gercek import execution acik degil
- [ ] `tools/run_import.sh` bilincli non-zero donuyor
- [ ] Translation bundle import varsayilan locked (`TRANSLATION_BUNDLE_ENABLED=false`)

Komut:
- `bash tools/run_import.sh ; echo $?`
- `bash tools/translation_bundle_dormant_check.sh`

## 6) Observability Gate
- [ ] Domain log klasorleri: `atlas, blog, ui, search, suggestions, ops, import, ai`
- [ ] mock seed/purge eventleri `logs/ops/*`
- [ ] import domain gelecekte real import eventleri icin rezerv
- [ ] request_id tracing RUNBOOK uzerinden uygulanabilir

Komut:
- `bash tools/log_report.sh --since 24h`
- `bash tools/log_report.sh --since 2h --domain ops`

## 7) Backup / Rollback Plan (Document Only)
- [ ] Import oncesi DB backup proseduru yazili
- [ ] Rollback adimlari tanimli
- [ ] Backup dosyalari repo icine commit edilmez

Not:
- Bu dosya operasyonel gate'tir; importu calistirmak icin izin vermez.
