# RUNBOOK_IMPORT (Design-Only, No Execution)

Durum: Hazirlik / Tasarim  
Gercek import: **Bu klasorden de su anda calistirilmaz**

## 1) Fazlar (Gelecek)
1. Dry-run (izole ortam)
2. QC ve veri dogrulama (safe-fields + idempotency)
3. Core import (ulke/admin/city)
4. POI fazi (ayri rollout)

## 2) Her Fazda Zorunlu Kurallar
- Idempotency key zorunlu
- Safe update fields disina cikilmaz
- Manuel override alanlari ezilmez
- Import batch audit kayitlari tutulur
- Rollback plani olmadan production import baslatilmaz

## 3) Dry-Run Akisi (Plan)
1. Konfig dogrulama:
   - `scripts/validate_workspace.sh`
2. Profil secimi:
   - `profiles/TR.yml` vb.
3. Payload kontrat kontrolu:
   - `contracts/atlas-import.v1.schema.json`
4. Sonuc:
   - Sadece rapor/cikti; core Strapi mutasyonu yok

## 4) Token/Secret Pattern
- Tokenlar **repo icinde tutulmaz**
- `.env`, `secrets/`, dump ve log ciktilari commit edilmez
- `.gitignore` bu artefaktlari engeller

## 5) Core ile Senkronizasyon
- `profiles/` ve `contracts/` degisiklikleri PR ile gozden gecirilir
- Core ile import-workspace baglantisi dokuman/kontrat seviyesindedir
- Runtime baglantisi bu sprintte acik degildir
