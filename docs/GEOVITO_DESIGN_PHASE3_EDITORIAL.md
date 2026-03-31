# Geovito Design Phase 3 — Blog / Editorial

## 1) Yapilan Degisiklikler
- Blog listing (`/{lang}/blog/`) ve blog detail (`/{lang}/blog/{postSlug}/`) yuzeyleri editorial odakli premium hiyerarsiye tasindi.
- Her iki yuzeyde de shell scope kilidi eklendi:
  - `blog-listing`
  - `blog-detail`
- Blog yuzeylerinde `showTools={false}` acikca sabitlendi; sag tools kolonu acilmadi.
- Listing tarafinda editorial intro + meta summary + esit grid kart akisi kuruldu (featured-first uygulanmadi).
- Detail tarafinda hero/header + reading column + engagement bloklari daha dengeli ve okunur hale getirildi.
- Blog detail icindeki inline stil blog scope'lu global katmana tasindi.

## 2) Listing Notlari
- Veri ve route davranisi korunarak yalnizca gorsel hiyerarsi guclendirildi.
- Kartlar `card-base card-editorial` cizgisine alindi.
- Durum/sinyal metinleri i18n key tabaninda normalize edildi.
- Responsive hedef:
  - Desktop: 3 kolon
  - Tablet: 2 kolon
  - Mobile: 1 kolon

## 3) Detail Notlari
- Ust alan editorial hero mantigina tasindi: baslik, ozet, creator/meta ve review hint ayristirildi.
- Govde `content-wrap-reading` ile okuma kolonuna cekildi.
- `StateBanner`, `AdSlot`, `translate=1` preview linki, yorum/begeni scripti ve API contract aynen korundu.
- Engagement/comment/report/helpful davranislari degismedi; sadece sunum ve ritim iyilestirildi.

## 4) Responsive Yaklasim
- Mobile: dar ekranda rahat okuma, tasma kontrolu, daha kompakt hero/meta.
- Tablet: listing 2 kolon ritmi ve detailde dengeli reading column.
- Desktop: ferah editorial grid + guclu publication hissi.

## 5) Kullanilan Foundation Yapilari
- Typografi: `type-label`, `type-h1`, `type-body-lg`, `type-body-sm`, `gv-h2`, `gv-h3`.
- Layout: `section-gap-*`, `stack-*`, `content-wrap-reading`.
- Surface/Card: `card-base`, `card-editorial`, `surface-elevated`, `status-pill`.

## 6) Bilincli Olarak Dokunulmayan Alanlar
- Homepage, atlas listing/detail, dashboard, account, admin/moderation, auth, profile mini-site.
- Route/auth/policy/backend/API ve veri modeli.
- Moderation/indexability/review-state is mantigi.

## 7) Risk / Dikkat Notlari
- Global stil degisikligi blog page-surface ile sinirlandirildi; scope disi etki beklenmez.
- Listing ve detail selector kontratlari korunmustur; yine de Playwright regresyonlari calistirilmali.
- Existing kirli calisma agacinda FAZ 3 commit'i sadece editorial kapsamli dosyalari stage etmelidir.
