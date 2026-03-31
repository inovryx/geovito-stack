# Geovito Design QA / Consistency Pass

## Scope
Bu pass sadece aşağıdaki yüzeyleri hedefler:
- homepage (`home-discovery`)
- atlas listing (`atlas-listing`)
- atlas detail (`atlas-detail`)
- blog listing (`blog-listing`)
- blog detail (`blog-detail`)
- account (`account-workspace`)

Dokunulmayan alanlar:
- dashboard/control/admin/moderation
- auth akışları
- route/API/policy/veri modeli

## Tespit Edilen Tutarsızlıklar
1. Atlas ve blog stillerinin bir kısmı `global.css` içinde unscoped tanımlıydı; yüzeyler arası style sızıntısı riski vardı.
2. Account sayfasındaki büyük inline `<style>` bloğu bakım maliyeti ve token paritesi açısından riskliydi.
3. Mobil/tablet breakpoint’lerde homepage/atlas/blog için bazı responsive kurallar scope dışı kalıyordu.
4. Link odak (focus-visible) tutarlılığı listing/detail yüzeylerinde eşit değildi.
5. Atlas badge truncate kuralı globaldi; diğer badge kullanımlarına etki riski taşıyordu.

## Uygulanan Düzeltmeler
1. `global.css` içinde atlas/blog/home sınıfları ilgili `data-page-surface` kapsamına alındı.
2. Account inline stilleri kaldırılıp `account-workspace` scope altında `global.css`’e taşındı.
3. Account stil tokenları yeni aile ile hizalandı (`--border-subtle`, `--surface-card`, `--surface-subtle`, `--ink`).
4. Responsive media query içindeki home/atlas/blog kuralları yüzey-scope ile normalize edildi.
5. Atlas/blog kritik linklerde focus-visible stili aynı kalite çizgisine getirildi.
6. Atlas state/kind badge truncate kuralı listing/detail scope’a daraltıldı.

## Dokunulmayan Alanlar
- Dashboard modüler/focus mode davranış katmanı
- Moderation ve admin operasyon ekranları
- Auth sayfalarının akış ve davranışları
- Backend, API kontratları, event/logging kontratları

## Risk / Dikkat Notları
1. Çalışma ağacında önceki fazlardan gelen değişiklikler mevcut; bu pass yalnız scoped yüzey kalibrasyonuna odaklanır.
2. `global.css` hâlâ geniş bir dosya; ileri aşamada modüler stylesheet bölünmesi bakım hızını artırır.
3. Search yüzeyindeki genel sınıflar bu pass kapsamında yeniden parçalanmadı; davranış riski olmaması için mevcut hali korundu.

## Sonraki İyileştirme Önerileri (Opsiyonel)
1. Yüzey bazlı style katmanlarını (`home/atlas/blog/account`) dosya bazında ayırma.
2. Görsel regresyon için hedefli screenshot testlerini genişletme.
3. Tipografi yardımcı sınıfları için küçük bir lint/review kontrolü ekleme.
