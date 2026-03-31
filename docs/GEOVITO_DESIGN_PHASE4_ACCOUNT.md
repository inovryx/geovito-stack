# Geovito Design Phase 4 — Account / Personal Area

## 1) Yapilan Degisiklikler
- Account yuzeyine ozel shell scope eklendi: `pageSurface="account-workspace"`.
- `/{lang}/account/` sayfasi iki katmanli bilgi mimarisine tasindi:
  - Ustte `overview` bandi
  - Altta `hybrid 2-zone` icerik alani (main + side)
- Account tools kolonu explicit kapatildi: `showTools={false}`.
- Mevcut section id/data kontratlari korunarak section yerlesimi sade ve moduler hale getirildi.

## 2) Information Architecture Notlari
- Main zone (birincil akis):
  - profile
  - comments queue (`#comments`)
  - account requests (`#account-requests`)
  - saved lists (`#saved-lists`)
- Side zone (ikincil/ayar akis):
  - language + preferences
  - notifications + onboarding
  - locale progress (`#locale-progress`)
  - follows/community
  - password/security
- Testlerin kullandigi selectorlar korunmustur (`data-account-*`).

## 3) Progressive Disclosure Kararlari
- Ana is akislarinin gorunurlugu korunmustur.
- Yalnizca yogun alt icerikler disclosure ile ikincil katmana alinmistir:
  - onboarding starter examples
  - locale deploy extra command bloklari
- Uygulama mevcut primitive ile yapildi (`Accordion` / `details`), yeni karmasik davranis eklenmedi.

## 4) Responsive Yaklasim
- Mobile: tek akis, daha kisa spacing, kart yogunlugu kontrolu.
- Tablet: ana akis korunurken ritim sikilastirmasi.
- Desktop: hybrid 2-zone (`1.45fr / 1fr`) ile birincil ve ikincil alan ayrimi.

## 5) Kullanilan Foundation Yapilari
- Surface/Layout: `surface-elevated`, `card-base`, `stack-*`, `section-gap-*`.
- Typografi: `type-label`, `type-h1`, `type-h2`, `type-h3`, `type-body-sm`.
- Account scope stilleri `body[data-page-surface="account-workspace"]` altinda tanimlandi.

## 6) Bilincli Olarak Dokunulmayan Alanlar
- Dashboard/control/admin/moderation
- Homepage/atlas/blog/auth/public profile
- Route, auth/policy, backend/API, veri modeli
- Account endpoint davranislari ve query/hash is akislari

## 7) Risk / Dikkat Notlari
- Global stil etkisi account page-surface ile sinirlandirildi.
- Selector kontratlari korunmustur; yine de Playwright regresyonlari zorunlu calistirilmalidir.
- Bu faz yalnizca sunum/hiyerarsi degisimi yapar; is kurallari degismez.
