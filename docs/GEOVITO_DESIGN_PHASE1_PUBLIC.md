# Geovito Design Phase 1 — Public Homepage / Discovery

## 1) Yapilan Degisiklikler
- Public homepage (`/{lang}/`) bilgi mimarisi yeniden kuruldu: Hero -> Atlas discovery -> Editorial preview -> Utility.
- Homepage, shell seviyesinde `pageSurface="home-discovery"` ile isaretlenerek stil etkisi yalnizca bu yuzeye scope edildi.
- Homepage artik `showTools={false}` kullaniyor; utility kartlari ana icerikte ikincil bir bolum olarak gosteriliyor.
- Hero ve discovery bloklari Faz 0 token/typography/surface siniflariyla premium dokuya cekildi.
- Atlas ve editorial kartlari ayrik kart aileleriyle (`card-atlas`, `card-editorial`) sunuldu.
- Utility alani (`card-utility`) ana deger katmanindan ayrildi.
- Status etiketleri ve review badge metinleri i18n key uzerinden normalize edildi.

## 2) Responsive Yaklasim
- Mobile-first akis korundu.
- Mobile (<=767): tek kolon akis, kisa hero, dusuk yogunluk.
- Tablet (768-1099): kontrollu iki kolon ritmi, utility iki kolona kadar aciliyor.
- Desktop (>=1100): atlas listeleri daha okunabilir dagiliyor, utility 3 kolonlu ikincil destek bolumu olarak konumlaniyor.

## 3) Kullanilan Token / Utility Yapilari
- Typografi: `type-display`, `type-h2`, `type-title`, `type-body-lg`, `type-body-sm`, `type-label`.
- Surface/Card: `card-base`, `card-atlas`, `card-editorial`, `card-utility`, `surface-elevated`.
- Ritim/Spacing: `stack-*`, `section-gap-md`, `space-*` tokenlari.

## 4) Yeniden Duzenlenen Bloklar
- Header (homepage scope): daha sade nav/search dengesi.
- Hero: arama merkezli vitrin.
- Atlas discovery: one cikan ulke/sehir bloklari.
- Editorial preview: yeni haftalik icerik + son bloglar.
- Utility zone: destekleyici, ikincil katman.

## 5) Bilincli Olarak Dokunulmayan Alanlar
- Dashboard, account, admin, moderation, atlas detail, blog detail.
- Route yapisi, auth/policy akislari, backend/API, veri modeli.
- Feature davranislari (yeni ozellik ekleme/kaldirma yok).

## 6) Risk / Dikkat Notlari
- Homepage tools kolonundan ana icerige tasindigi icin utility gorunumu daha kontrollu ama farkli konumda.
- Stil scope `home-discovery` ile sinirli tutuldu; diger yuzeylere yayilim beklenmez.
- Sonraki fazlarda public shell sadeleme/left-sidebar stratejisi tekrar degerlendirilebilir.
