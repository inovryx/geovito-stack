# Geovito Design Phase 2 — Atlas Listing + Atlas Detail

## 1) Yapilan Degisiklikler
- Atlas listing (`/{lang}/atlas/`) ve atlas detail (`/{lang}/atlas/{placeSlug}/`) yuzeyleri premium/authoritative cizgiye cekildi.
- Her iki atlas yuzeyi page-surface ile scope edildi:
  - `atlas-listing`
  - `atlas-detail`
- Atlas listing intro/hero alani guclendirildi: baslik, aciklama, filtre chip, meta summary, state legend hiyerarsisi netlestirildi.
- Atlas kart sunumu `card-atlas` odakli hale getirildi; state/kind rozetleri ve snippet ritmi dengelendi.
- Atlas detail ust alan (PlaceHeader), quick facts, hierarchy, related ve nearby bloklari daha tutarli kart/surface diline getirildi.
- Quick facts bolumu detail icerik akisinda overview sonrasina alindi.

## 2) Listing Notlari
- Listing sayfasi artik `showTools={false}` ve `pageSurface="atlas-listing"` ile calisiyor.
- Client-side filter + pagination scripti korunarak sadece gorunur hiyerarsi iyilestirildi.
- Data selector contract'lari (`data-atlas-*`, `data-ev-*`) korunmustur.
- Desktop: 3 kolon, Tablet: 2 kolon, Mobile: 1 kolon hedefi uygulandi.

## 3) Detail Notlari
- Detail sayfasi `pageSurface="atlas-detail"` ile scope edildi.
- Mevcut state/indexability/language/review davranisi degismedi.
- PlaceHeader authoritative gorunume guclendirildi; breadcrumb, title, meta ve rozetler daha net ayrildi.
- Related posts `card-editorial`, bilgi odakli atlas bloklari `card-atlas` diliyle ayrildi.
- Mini TOC desktop sticky + mobile details davranisi korunarak gorsel kalite yukseltildi.

## 4) Responsive Yaklasim
- Mobile: stack agirlikli, tasma kontrolu, daha kompakt header/facts.
- Tablet: listing 2 kolon, detail daha rahat okunurluk.
- Desktop: listing 3 kolon discovery duzeni, detail ana kolon + destek rail dengesi.

## 5) Kullanilan Foundation Yapilari
- Typografi: `type-h1`, `type-label`, `gv-h2`, `type-body`.
- Surface/Card: `card-base`, `card-atlas`, `card-editorial`, `card-compact`.
- Spacing/Rhythm: `space-*`, `stack-*`, `section-gap-*`.

## 6) Bilincli Olarak Dokunulmayan Alanlar
- Homepage/discovery, regions, blog detail, dashboard, account, admin/moderation.
- Route, auth/policy, backend/API, data modeli.
- Indexability/canonical/robots/language-state/review-state mantigi.

## 7) Risk / Dikkat Notlari
- Listing grid kolon dagilimi degistigi icin tablet assertionlari testte guncellendi.
- Atlas page-surface scope'u ile etkiler atlasla sinirli tutuldu; yine de global.css degisikligi nedeniyle regresyon testleri calistirilmali.
