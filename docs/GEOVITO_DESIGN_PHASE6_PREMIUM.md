# Geovito Design Phase 6 - Premium Visual Identity

## 1) Yapilan Gorsel Degisiklikler
- Token katmaninda accent, dark surface ve elevation degerleri premium kimlige gore kalibre edildi.
- Hero/depth icin yeni yardimci tokenlar eklendi:
  - `--hero-gradient`
  - `--hero-radial-glow`
  - `--hero-noise`
  - `--surface-glass`
- Header, kart, search ve state katmanlari daha rafine border + shadow + focus dili ile guncellendi.
- Mevcut davranis (route, auth/policy, API, SEO, role/state akislari) degistirilmedi.

## 2) Hero Yaklasimi
- `home-discovery` hero alani buyutuldu ve daha guclu bir ilk izlenim icin iki katmanli derinlik dili verildi.
- Hero baslik olcegi artirildi, lead metin okunabilirligi guclendirildi.
- Search bar visual prominence artirildi:
  - daha guclu border/focus,
  - primary submit icin kontrollu gradient + depth.
- Hero katmaninda abartisiz glow + noise overlay kullanildi.

## 3) Color ve Depth Sistemi
- Light modda yumusak ama premium bir acik zemin dili korundu.
- Dark mod saf siyah yerine derin navy eksenine cekildi.
- `surface-card` / `surface-elevated` / `surface-glass` ayrimi daha net hale getirildi.
- Kart ve shell katmanlarinda daha tutarli elevation kullanildi.

## 4) Typography ve Interaction Kararlari
- `type-display`, `type-h1`, `type-h2`, `type-body` ve `type-body-sm` olcekleri kalibre edildi.
- Focus-visible kontrasti guclendirildi; keyboard gezinme okunurlugu arttirildi.
- Hover/active durumlari daha net ama sakin olacak sekilde token-first hizalandi.

## 5) Responsive Yaklasim
- Mobile-first korunarak hero kirilimlari yeniden dengelendi.
- `home-discovery` hero:
  - desktop: iki kolonlu premium vitrin,
  - tablet/mobile: tek kolon, tasmasiz ve okunur akis.
- Atlas/blog/account yuzeylerinde var olan responsive davranis korunup spacing ritmi rafine edildi.

## 6) Bilincli Olarak Dokunulmayanlar
- Route/slug davranisi
- Auth/policy ve role gating
- Backend/API/veri modeli
- SEO/indexability/canonical/hreflang mantigi
- Feature/state logic (focus mode, strict single-view, moderation, account workflow)

## 7) Risk ve Dikkat Notlari
- Faz 6 degisiklikleri agirlikla `tokens.css` + `global.css` katmaninda oldugu icin gorsel etkiler tum yuzeylerde hissedilir.
- Her release oncesi dark/light manuel parity kontrolu ve mevcut Playwright smoke akislari kosulmalidir.
- Future preset readiness korunmustur; global site theme yonetimi owner/superadmin kapsaminda kalmaya devam eder.
