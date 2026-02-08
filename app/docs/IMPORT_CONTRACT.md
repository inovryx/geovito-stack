# Strapi Import Landing Contract

Bu dokuman Strapi tarafinda import data'nin nereye inecegini tanimlar.

## Landing Tables
- `api::import-batch.import-batch`
- `api::gazetteer-entry.gazetteer-entry`
- `api::atlas-place.atlas-place`

## Upsert Key'leri
- `import-batch`: `idempotency_key` (unique)
- `gazetteer-entry`: `record_id` (unique)
- `atlas-place`: `place_id` (unique)

## Safe Update Fields (Atlas)
- `country_code`
- `admin_level`
- `latitude`
- `longitude`
- `import_payload_version`
- `import_checksum`
- `translations`
- `parent`

## Protected Fields
- `mock`
- `publishedAt`
- Strapi sistem alanlari (`id`, `documentId`, `createdAt`, `updatedAt`)

## Idempotency
- Ayni `idempotency_key` ikinci kez geldiginde batch tekrar uygulanmaz.
- Adapter once `import-batch` kaydini kontrol eder, sonra upsert akisini calistirir.
