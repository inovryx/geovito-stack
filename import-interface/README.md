# Geovito Import Interface (Dormant)

Bu klasor gelecekteki Atlas import pipeline'i icin **baglanti kontratini** tanimlar.

## Durum
- Aktif import execution: **YOK**
- Cron/worker: **YOK**
- Bu repodaki rol: import almaya hazir hedef sistem

## Contract
- JSON schema: `contracts/atlas-import.v1.schema.json`
- Ornek payload: `examples/atlas-import.v1.mock.json`

## Strapi Landing Targets
- `api::import-batch.import-batch` -> batch metadata + idempotency
- `api::gazetteer-entry.gazetteer-entry` -> ham kaynak kaydi (opsiyonel saklama)
- `api::atlas-place.atlas-place` -> canonical atlas kaydi

## Safe Update Fields
Import tarafi sadece su alanlari guncelleyebilir:
- `country_code`
- `admin_level`
- `latitude`
- `longitude`
- `import_payload_version`
- `import_checksum`
- `translations`
- `parent` (yalnizca `parent_place_id` referansi resolv edildiginde)

Asagidaki alanlar import tarafindan degistirilmez:
- `mock`
- `publishedAt`
- Strapi sistem alanlari (`id`, `documentId`, `createdAt`, `updatedAt`)

## Idempotency
- Her batch `idempotency_key` tasir.
- `import-batch.idempotency_key` uniq'dir.
- Ayni key tekrar geldiginde batch tekrar uygulanmaz; son bilinen sonuc donulur.

## Not
`tools/run_import.sh` bilerek devre disi birakilmistir.
