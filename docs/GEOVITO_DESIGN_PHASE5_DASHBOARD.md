# Geovito Design Phase 5 — Dashboard / Control Center

## 1) Yapilan Degisiklikler
- Dashboard sayfasi shell sinyali netlestirildi: `pageSurface="dashboard-control"`.
- Dashboard ust kontrol alani (head) role-aware context ile guclendirildi:
  - aktif rol,
  - aktif top module,
  - aktif subsection,
  - focus mode + refresh aksiyonlari.
- Module/subsection nav gorunumu daha sakin ve taranabilir hale getirildi.
- Lane/panel yogunlugu kalibre edildi; operasyon kartlari ayni kalite bandina cekildi.
- Durum/severity gorunumu (warn/ok/success/error) daha tutarli ve daha okunur hale getirildi.

## 2) Module / Subsection IA Notlari
- Mevcut IA korunmustur: `account`, `content`, `community`, `ops`, `admin`.
- Mevcut strict single-view ve focus mode davranisi degismemistir.
- Mevcut hash alias, lane map ve localStorage persistence anahtarlari korunmustur:
  - `geovito_dashboard_focus_mode_v1`
  - `geovito_dashboard_active_module_v1`
  - `geovito_dashboard_last_subsection_v1`
- `data-testid` ve `data-dashboard-*` selector sozlesmeleri korunmustur.

## 3) Role-Gated Sunum Kararlari
- Role gating davranisi degistirilmedi; sadece sunum netlestirildi.
- Role baglami dashboard head'e tasinarak kullanicinin hangi yetki seviyesinde oldugu daha hizli okunur hale getirildi.
- Gizli/gosterilen module ve subsection davranislari mevcut JS akisiyla aynen korunmustur.

## 4) Responsive Yaklasim
- Desktop: operasyonel netlik ve taranabilirlik onceliklendirildi.
- Tablet: top module/subsection nav ve lane baslik ritmi korunarak yogunluk dusuruldu.
- Mobile: dashboard head tek kolona inerek okunabilirlik artirildi; context pill'ler tasmasiz akista kaldi.

## 5) Kullanilan Foundation Yapilari
- Faz 0 token ve interaction temelinden yararlanildi:
  - `--motion-*`, `--ease-standard`, `--focus-ring`
  - mevcut surface/border/ink tokenlari.
- Kart/panel hiyerarsisi token-first kalibre edildi; davranis katmani degistirilmedi.

## 6) Bilincli Olarak Dokunulmayan Alanlar
- Homepage, atlas, blog, account, auth, public profile
- Dashboard disi route ve layout davranislari
- Backend/API/policy/veri modeli
- Dashboard feature logic (moderation/report/account-request/community/activity)

## 7) Risk / Dikkat Notlari
- Bu faz markup + CSS polish odaklidir; feature akisi degismez.
- Dashboard testleri selector/contract'e hassas oldugu icin her release oncesi UI + role smoke kosulmalidir.
- Dashboard head context gorunur hale geldigi icin gelecekte i18n ton tutarliligi ayni blokta korunmalidir.
