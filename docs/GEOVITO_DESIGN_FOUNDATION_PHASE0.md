# Geovito Design Foundation - Phase 0

## Amac
Bu fazin hedefi, mevcut urun davranislarini bozmadan premium tasarim donusumu icin token-first bir temel kurmaktir.

## Eklenen Token Aileleri
`frontend/src/styles/tokens.css` icinde asagidaki aileler eklendi:
- Spacing: `--space-1/2/3/4/5/6/8/10/12`
- Radius: `--radius-sm/md/lg/xl/2xl/pill`
- Shadow/Elevation: `--shadow-sm/md/lg/xl`
- Surface: `--surface-base/subtle/card/elevated/overlay/accent-soft`
- Border: `--border-subtle/strong/accent`
- Content width: `--content-xs/sm/md/lg/xl/reading`
- Motion: `--motion-fast/base/slow`, `--ease-standard`
- Interactive: `--focus-ring`, `--focus-ring-offset`, `--interactive-hover`, `--interactive-active`

Not: Mevcut `--gv-*` degiskenleri geriye uyumluluk icin korundu ve yeni tokenlara aliaslandi.

## Eklenen Utility ve Surface Foundation
`frontend/src/styles/global.css` icine eklendi:
- Typography levels:
  - `type-display`, `type-h1`, `type-h2`, `type-h3`, `type-h4`, `type-title`
  - `type-body-lg`, `type-body`, `type-body-sm`, `type-meta`, `type-label`, `type-micro`
- Layout/ritim:
  - `content-wrap`, `content-wrap-wide`, `content-wrap-reading`
  - `section-gap-sm/md/lg`, `stack-sm/md/lg`
- Semantic surface:
  - `surface-base`, `surface-card`, `surface-elevated`, `surface-overlay`, `surface-panel`, `surface-soft`
- Card family:
  - `card-base`, `card-atlas`, `card-editorial`, `card-utility`, `card-dashboard`, `card-compact`

## Primitive Hizalama
Asagidaki primitive katmanlari token-first gorsel degerlere hizalandi:
- `ui-button`
- `ui-input`
- `ui-card`
- `ui-badge`
- `ui-empty-state`
- `ui-skeleton`

Ayrica bilesen sinif kontratini bozmadan utility cakismalari azaltildi:
- `frontend/src/components/ui/Button.astro`
- `frontend/src/components/ui/Badge.astro`
- `frontend/src/components/ui/Card.astro`

## Shell Duzeyi Minimal Baglama
Davranis degistirmeden sinirli baglama yapildi:
- `BaseLayout`: header/banner/footer yuzeyleri foundation siniflariyla hizalandi.
- `LeftSidebar`: bloklar `surface-card + card-compact` ile ayni gorsel dile baglandi.

## Theme Control Modeli (Kilitleme)
1. **Default brand theme:** `brand-default`
2. **Personal mode preference:** foundation seviyesinde `system/light/dark` destegi hazirlandi.
3. **Future preset readiness:** token isimlendirmesi preset-ready olacak sekilde duzenlendi.
4. **Global theme governance:**
   - Global site theme/preset kullanici tercihi degildir.
   - Yalnizca owner/superadmin yonetisim alanidir.
   - Bu fazda yeni tema yonetim UI'i acilmadi.
   - Coklu preset aktivasyonu yapilmadi.

## Risk ve Dikkat Notlari
- Faz 0 intentionally foundation-only tutuldu; buyuk sayfa redesign yapilmadi.
- Route/auth/policy/role is mantigina dokunulmadi.
- Gelecek fazlarda sayfa bazli redesign yapilirken bu token/utility katmanlarinin yeniden kullanimi hedeflenmelidir.
