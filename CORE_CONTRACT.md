# Geovito Core Contract v1

Bu dokuman, degistirilemez cekirdek kurallari tanimlar.
Yeni ozellikler bu kurallari ihlal edemez.

## 1) Stable IDs ve URL Surekliligi
- `place_id` immutable'dir.
- Canonical URL politikasi geriye donuk kirici sekilde degistirilemez.
- Guncellemeler evrimsel olmalidir (destructive degil).
- `region_group` parent-chain katmani degildir; grouping katmanidir.

## 2) Dil + Indexleme Invariantlari
Atlas ve RegionGroup icin:
- yalniz `en + complete + mock=false` indexlenebilir
- diger tum varyantlar `noindex,nofollow`
- non-EN canonical, EN complete URL'e baglanir (varsa)
- runtime/fallback gorunumler indexlenmez

Authoring notu:
- TR authoring locale olarak desteklenir.
- SEO canonical/index locale EN olarak kalir.

## 3) Otorite Siniri
- Atlas authoritative + editorial domain'dir.
- Kullanici Atlas verisini dogrudan degistiremez.
- Kullanici yalniz suggestion gonderir.
- Suggestion Atlas kaydini otomatik mutate etmez.

Region precedence:
1. `region_override` varsa o kazanir.
2. Yoksa `country_profile.region_auto_assign` uygulanir.
3. Effective region `region` alanina yazilir.
4. Effective region, ilgili auto `region_group` uyeligini additive sekilde zorlar.

## 4) Search Siniri
- Search index turetilmis veridir, canonical kaynak degildir.
- Atlas ve Blog ranking kurallari ayridir.
- Domain kurallari karistirilmaz.

## 5) Import + Bundle Guvenlik Siniri
- Real import execution dormant kalir (`IMPORT_ENABLED=false`).
- Cron/fetcher/auto importer yoktur.
- Translation bundle import da default dormant kalir (`TRANSLATION_BUNDLE_ENABLED=false`).

Translation bundle safe-field contract:
- Allowed (localized): `title`, `slug`, `excerpt`, `body`, `seo`
- Blocked (core/editorial):
  - `parent`, `parent_place_id`
  - `place_type`
  - `country_profile`
  - `region_override`
  - `region_groups`
  - `mock`

Status mutasyonu:
- Varsayilan kapali: `TRANSLATION_BUNDLE_ALLOW_STATUS_PROMOTE=false`
- Aciksa sadece promotion izinli (downgrade yasak)

## 6) Feature Evaluation Checklist
Her yeni ozellik icin zorunlu kontrol:
1. `place_id` veya URL surekliligini bozuyor mu?
2. EN-only index gate'i deliyor mu?
3. Atlas authority sinirini asiyor mu?
4. Search domain ayrimini zayiflatiyor mu?
5. Dormant import/bundle ilkesini bozuyor mu?
6. Manual override guvencesini riske atiyor mu?

Herhangi bir madde `evet` ise: ozellik reddedilir veya yeniden tasarlanir.
