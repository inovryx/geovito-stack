# Dashboard Design Note (Sprint: Premium Visual Polish)

## Hedef
- Davranış katmanını koruyarak dashboard'ı daha premium, sade ve ürün hissi yüksek bir panele taşımak.

## Görsel Kararlar
- Dashboard shell yüzeyi güçlendirildi:
  - yumuşak gradient arka plan
  - tutarlı border/radius/shadow dili
  - başlık alanında daha net durum hiyerarşisi
- Home ve section görünümü ayrıştırıldı:
  - `is-dashboard-home` aktifken modül kart alanı görünür
  - section görünümünde (`general` harici) modül kart alanı gizlenir
  - üst modül nav section görünümünde ikincil tona çekilir
  - subsection nav birincil görev seçimi gibi öne çıkarılır
- Kart sistemi dengelendi:
  - ana lane kartları daha güçlü yüzey hissi
  - yardımcı kartlarda daha sakin ama tutarlı yüzey
  - button/pill/badge durumlarında daha kontrollü brand aksanı
- Sol menü premiumlaştırıldı:
  - dashboard route linkleri pill/tab görünümüyle daha belirgin aktif durum
  - blok başlıklarında daha net bilgi mimarisi hissi
- Sağ kolon düzeni güçlendirildi:
  - widget kartlarında yüzey birliği
  - başlık/metin ritminde okunabilirlik artışı

## Davranış Güvenceleri
- Strict single-view korunur: `general` hariç alt bölümde yalnız ilgili kartlar görünür.
- Focus mode davranışı korunur.
- Role gating korunur.
- Hash/anchor yönlendirme korunur.
- localStorage persistence korunur (`focusMode`, `activeModule`, `lastSubSection`).

## Etkilenen Dosyalar
- `frontend/src/pages/[lang]/dashboard/index.astro`
- `frontend/src/components/LeftSidebar.astro`

## Doğrulama
- `bash tools/dashboard_activity_ui_playwright.sh`
- `bash tools/account_comment_queue_test.sh`
