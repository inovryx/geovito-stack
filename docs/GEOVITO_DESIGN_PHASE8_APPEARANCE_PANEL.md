# Geovito Design v1 — FAZ 8 (Appearance Panel)

## 1) Panel Entegrasyonu
- Appearance paneli `/{lang}/dashboard/` içinde mevcut `settings` subsection alanına eklendi.
- Yeni route açılmadı; mevcut dashboard bilgi mimarisi (module/subsection/focus mode) korunuyor.
- Panel test hook'ları:
  - `dashboard-appearance-panel`
  - `dashboard-appearance-mode-*`
  - `dashboard-appearance-accent-*`
  - `dashboard-appearance-surface-*`

## 2) Desteklenen Kullanıcı Tercihleri
- Theme mode:
  - `system`
  - `light`
  - `dark`
- Accent:
  - `brand-default`
  - `sapphire`
  - `emerald`
  - `amber`
  - `plum`
- Surface style:
  - `soft`
  - `glass`
  - `flat`
- `density` bu fazda bilinçli olarak ertelendi.

## 3) Data Attribute ve Persistence Modeli
- Uygulanan html attribute sözleşmesi:
  - `data-theme-mode`
  - `data-theme-resolved`
  - `data-theme-accent`
  - `data-surface-style`
- LocalStorage anahtarları:
  - `geovito_theme_mode`
  - `geovito_theme_accent`
  - `geovito_surface_style`
- Geriye uyum:
  - Legacy `theme` anahtarı mode için okunmaya devam eder.
  - Yeni mode kaydında hem `geovito_theme_mode` hem `theme` yazılır.

## 4) Token Genişletmeleri
- `tokens.css` içine accent override setleri eklendi (`html[data-theme-accent="..."]`).
- `tokens.css` içinde surface style override setleri eklendi (`html[data-surface-style="..."]`).
- Tüm varyasyonlar mevcut design token ailesi ile uyumlu ve kontrast odaklı kalibre edildi.

## 5) Bilinçli Olarak Dokunulmayan Alanlar
- Backend/API/policy/route/state mantığı.
- SEO/indexability/canonical/review-state davranışları.
- Dashboard role gating, focus mode, single-view mantığı.
- Global brand preset yönetişimi (`data-theme-preset="brand-default"` korunur).

## 6) Risk ve Dikkat Notları
- Appearance tercihleri local-first olduğu için cihaz/oturum bazlı davranır.
- Gelecekte backend preference senkronu eklenirse öncelik sırası açıkça tanımlanmalı.
- Yeni accent/surface kombinasyonları eklenecekse erişilebilirlik (kontrast/focus) smoke kontrolüne dahil edilmelidir.
