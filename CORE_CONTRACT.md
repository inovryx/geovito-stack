# Geovito Core Contract v1

Bu dokuman, cekirdek sistemde degistirilemez mimari kurallari tanimlar.
Yeni ozellikler bu kontrata uymak zorundadir.

## 1) Stable IDs ve URL Kurali
- `place_id` olusturulduktan sonra degistirilemez.
- Canonical URL kurali sabittir; slug politikasi geriye donuk kirilmadan evrimlesir.
- Guncellemeler yikici degil, evrimsel olmalidir.
- URL ve ic link yapisi SEO surekliligini bozacak sekilde degistirilemez.
- Region group katmani parent-chain katmani degildir; yalnizca grouping alanidir.

## 2) Dil ve Indexleme Kurali
- Atlas icerikleri dil bazinda yalnizca su durumlarda olabilir:
  - `missing`
  - `draft`
  - `complete`
- Atlas ve RegionGroup sayfalari icin varsayilan indexleme EN-merkezlidir:
  - yalnizca `en + complete + mock=false` indexlenebilir
  - diger tum dil varyantlari `noindex` kalir ve EN complete canonical'a baglanir
- Runtime/otomatik ceviri gorunumleri:
  - acikca etiketlenir
  - non-index kalir

## 3) Otorite Siniri
- Atlas domain authoritative ve editorial kontrolludur.
- Kullanici Atlas kaydini dogrudan degistiremez.
- Kullanici yalnizca suggestion gonderir.
- Suggestion kayitlari Atlas kaydini otomatik mutate etmez.
- Region precedence kontrati:
  - `region_override` varsa bu deger authoritative olur.
  - `region_override` yoksa country-profile auto mapping kullanilir.
  - effective region, `region` alanina yazilir ve ilgili auto `region_group` uyeligini zorlar.

## 4) Search Siniri
- Search index turetilmis veridir, canonical kaynak degildir.
- Atlas ve Blog ranking/kural setleri ayrik kalir.
- Domainler arasi ranking karistirilmaz.

## 5) Import Guvenlik Kurali
- Import bu fazda dormant kalir; execution cron/worker acilmaz.
- Gelecekte acilsa bile:
  - idempotent olmalidir
  - yalnizca safe update fields uzerinden calismalidir
- Manuel override edilen alanlar otomatik sureclerce ezilemez.
- Translation bundle import da default dormant kalir (`TRANSLATION_BUNDLE_ENABLED=false`).

## 6) Yeni Ozellik Degerlendirme Checklist
Her yeni ozellik PR'i icin zorunlu kontrol:
1. `place_id` immutability veya canonical URL surekliligini bozuyor mu?
2. Dil state ve indexleme kurallarini ihlal ediyor mu?
3. Atlas authority sinirini asiyor mu?
4. Search domain ayrimini zayiflatiyor mu?
5. Dormant import ilkesini ihlal ediyor mu?
6. Manual override guvencesini riske atiyor mu?

Herhangi bir maddeye cevap `evet` ise:
- ozellik reddedilir veya
- kontrata uyacak sekilde yeniden tasarlanir.
