# GEOVITO FEATURE AUDIT FOR DESIGN

Audit date: 2026-03-29 (UTC)
Scope: code-based verification only (no assumptions, no runtime mutation)
Status labels: `PRESENT`, `PARTIAL`, `PLACEHOLDER`, `HIDDEN_OR_ROLE_GATED`, `NOT_FOUND`, `UNCERTAIN`

## 1. Executive Summary

### Geovito bugun urun olarak ne durumda?
- Uygulama, public discovery (home/atlas/regions/blog/search) + authenticated utility (account/dashboard) + role-gated operasyon (editor/admin/owner) olarak katmanli bir yapiya sahip.
- Public ve app shell ayrimi mevcut; dashboard tarafi role-gated modul/subsection ve strict single-view davranisiyla daha urunlesmis durumda.
- Site-language release/preview kill-switch altyapisi aktif: dil eklemek ile dili public acmak ayrik tasarlanmis.

### En guclu mevcut alanlar
- Dashboard role-gated operasyon yuzeyi: `frontend/src/pages/[lang]/dashboard/index.astro`, `frontend/src/components/LeftSidebar.astro`
- Atlas detail/list + state/indexability handling: `frontend/src/pages/[lang]/atlas/[placeSlug].astro`, `frontend/src/pages/[lang]/atlas/index.astro`, `frontend/src/lib/indexGate.ts`
- Log/audit ve moderasyon backend kapsami: `app/src/modules/security/audit-log.js`, `app/src/api/*/controllers/*.js`
- i18n governance + audit araclari: `docs/I18N_GOVERNANCE.md`, `tools/i18n_*`, `tools/site_language_release_smoke.*`

### En zayif / tasarimi zorlastiran alanlar
- Public shell ile app shell ayni bileşen ailesini kullaniyor; bilgi yogunlugu bazı ekranlarda fazla.
- Utility kartlari (currency/visa/flights) context bagli yardim seviyesinde; derin islevsel entegrasyon kaniti sinirli: `frontend/src/components/RightTools.astro`
- Root dil redirect dosyasi registry helper yerine local hardcoded dil listesi kullaniyor: `frontend/src/pages/index.astro`
- Profil mirror (`/u/:username`) ayri EN route setiyle suruyor; tasarim dilinde iki yoldan bakim ihtiyaci yaratabilir: `frontend/src/pages/u/[username]/*`

## 2. Route & Surface Map

### Public surfaces
- Home: `frontend/src/pages/[lang]/index.astro` (`PRESENT`)
- Atlas list: `frontend/src/pages/[lang]/atlas/index.astro` (`PRESENT`)
- Atlas detail: `frontend/src/pages/[lang]/atlas/[placeSlug].astro` (`PRESENT`)
- Regions list/detail: `frontend/src/pages/[lang]/regions/index.astro`, `frontend/src/pages/[lang]/regions/[regionSlug].astro` (`PRESENT`)
- Blog list/detail: `frontend/src/pages/[lang]/blog/index.astro`, `frontend/src/pages/[lang]/blog/[postSlug].astro` (`PRESENT`)
- Search: `frontend/src/pages/[lang]/search/index.astro` (`PRESENT`)
- System pages (about/help/rules vb): `frontend/src/pages/[lang]/[systemSlug].astro` + `frontend/src/lib/systemPages.ts` (`PRESENT`)
- Legal pages: `frontend/src/pages/[lang]/privacy.astro`, `frontend/src/pages/[lang]/cookies.astro`, `frontend/src/pages/[lang]/terms.astro` (`PRESENT`)
- Root redirect: `frontend/src/pages/index.astro` (`PRESENT`, hardcoded language list riski)

### Authenticated user surfaces
- Account: `frontend/src/pages/[lang]/account/index.astro` (`PRESENT`)
- Dashboard: `frontend/src/pages/[lang]/dashboard/index.astro` (`PRESENT`, role-gated)
- Profile mini-site: `frontend/src/pages/[lang]/@[username]/index.astro` + `about/posts` (`PRESENT`)

### Auth surfaces
- Login/Register/Forgot/Reset: 
  - `frontend/src/pages/[lang]/login/index.astro`
  - `frontend/src/pages/[lang]/register/index.astro`
  - `frontend/src/pages/[lang]/forgot-password/index.astro`
  - `frontend/src/pages/[lang]/reset-password/index.astro`
  (`PRESENT`)

### Moderator/Admin/Owner surfaces
- Dashboard moderation/reports/account-requests/locale/control/ads/release kartlari: `frontend/src/pages/[lang]/dashboard/index.astro` (`HIDDEN_OR_ROLE_GATED`)
- Sidebar admin shortcuts + Strapi admin link: `frontend/src/components/LeftSidebar.astro` (`HIDDEN_OR_ROLE_GATED`)

### SEO/system routes
- Sitemap index/chunks: `frontend/src/pages/sitemap.xml.ts`, `frontend/src/pages/sitemaps/[bucket].xml.ts`, `frontend/src/lib/sitemap.ts` (`PRESENT`)
- Robots: `frontend/src/pages/robots.txt.ts` (`PRESENT`)
- `@username` language-aware redirect: `frontend/src/pages/@[username].ts` (`PRESENT`)

## 3. Role Matrix

| Role | Status | Neye erisir | Nerede dogrulandi | Not |
|---|---|---|---|---|
| Guest (anonim) | PRESENT | Public routes, login/register, blog comment guest mode | `frontend/src/pages/[lang]/*`, `frontend/src/pages/[lang]/blog/[postSlug].astro`, `app/src/api/blog-comment/controllers/blog-comment.js` | Guest yorum akisi captcha/limit/policy ile kontrol ediliyor. |
| Authenticated member | PRESENT | Account, dashboard member alanlari, follow/saved list islemleri | `frontend/src/pages/[lang]/account/index.astro`, `frontend/src/pages/[lang]/dashboard/index.astro`, `app/src/api/user-follow/controllers/user-follow.js`, `app/src/api/user-saved-list/controllers/user-saved-list.js` | Role rank tabanli UI gizleme + backend auth kontrolu birlikte var. |
| Editor | PRESENT | Moderation list/set, report/account request moderation, locale visibility UI | `app/src/api/blog-comment/controllers/blog-comment.js`, `app/src/api/content-report/controllers/content-report.js`, `app/src/api/account-request/controllers/account-request.js`, `frontend/src/pages/[lang]/dashboard/index.astro` | Ayri "moderator" role yerine editor/admin/owner kullaniliyor. |
| Admin | PRESENT | Editor yetkileri + control center + Strapi admin link + preview eligibility | `frontend/src/components/LeftSidebar.astro`, `frontend/src/layouts/BaseLayout.astro`, backend controller role checks | `super` role stringleri admin sinifina normalize ediliyor. |
| Owner | PRESENT | Admin benzeri genis operasyon + owner-only sinyaller/ops kartlari | `frontend/src/pages/[lang]/dashboard/index.astro`, `frontend/src/components/LeftSidebar.astro`, owner email hints | Owner role hem role type hem owner email hints ile tespit edilebiliyor. |
| Superadmin | PARTIAL | Backend/role parsingde admin kapsaminda ele aliniyor | `app/src/modules/security/audit-log.js`, backend controller `roleRaw.includes('super')` kontrolleri | UI tarafinda superadmin ayri yuzey olarak ayrismiyor; admin olarak davraniliyor. |
| Moderator (ayri role) | NOT_FOUND | Ayrik role stringe bagli akis dogrulanamadi | code scan sonucu | Moderation capability editor/admin/owner tarafina dagitilmis. |
| Creator/Contributor (ayri auth role) | PARTIAL | Ayrik role yerine content_source=`user` ve creator profile yuzeyi var | `app/src/api/blog-post/controllers/blog-post.js`, `frontend/src/pages/[lang]/@[username]/*` | Ayrik role/policy yerine icerik sahipligi ve moderation state ile ilerliyor. |

## 4. Feature Inventory Table

| Area | Feature | Status | Who can access | Where found | Notes |
|---|---|---|---|---|---|
| Public | Homepage discovery shell | PRESENT | Guest/All | `frontend/src/pages/[lang]/index.astro` | Public giris katmani mevcut. |
| Public | Atlas listing | PRESENT | Guest/All | `frontend/src/pages/[lang]/atlas/index.astro` | Filter chips, pagination, language-state badges mevcut. |
| Public | Atlas detail (hierarchy + quick facts + related) | PRESENT | Guest/All | `frontend/src/pages/[lang]/atlas/[placeSlug].astro` | Parent/child, nearby, related posts, travel cards var. |
| Public | Regions listing/detail | PRESENT | Guest/All | `frontend/src/pages/[lang]/regions/*` | Atlas disinda bolgesel yuzey ayrik. |
| Public | Blog listing/detail | PRESENT | Guest/All | `frontend/src/pages/[lang]/blog/*` | UGC/editorial post gorunurlugu kuralli. |
| Public | Search (atlas+region+blog) | PRESENT | Guest/All | `frontend/src/pages/[lang]/search/index.astro` | Tek arayuzde cok kaynakli sonuc seti. |
| Public | System pages (about/help/rules...) | PRESENT | Guest/All | `frontend/src/pages/[lang]/[systemSlug].astro` | Strapi ui-page translation/fallback state banner ile. |
| Public | Language selector release filter | PRESENT | Guest/All | `frontend/src/components/LanguageSwitcher.astro` | Normal kullaniciya yalniz released diller gorunur. |
| Public | Unreleased language preview | HIDDEN_OR_ROLE_GATED | Admin/Owner | `frontend/src/layouts/BaseLayout.astro`, `frontend/src/components/LanguageSwitcher.astro` | Query+storage + role check ile preview mode. |
| Public | Cookie/accept-language username redirect | PRESENT | Guest/All | `frontend/src/pages/@[username].ts` | Released sete normalize fallback yapiyor. |
| Public | Root language redirect | PARTIAL | Guest/All | `frontend/src/pages/index.astro` | Dil listesi hardcoded; registry helper ile tam hizali degil. |
| Auth | Login local + social + turnstile flags | PRESENT | Guest | `frontend/src/pages/[lang]/login/index.astro` | Env flaglere gore provider/yuzey degisiyor. |
| Auth | Register local + social + disabled state | PRESENT | Guest | `frontend/src/pages/[lang]/register/index.astro` | Lockdown/register flag davranislari var. |
| Auth | Forgot/reset password flows | PRESENT | Guest | `frontend/src/pages/[lang]/forgot-password/index.astro`, `frontend/src/pages/[lang]/reset-password/index.astro` | Route ve UI mevcut. |
| Account | Profile overview | PRESENT | Auth member+ | `frontend/src/pages/[lang]/account/index.astro` | Session + API snapshot birlesik. |
| Account | Comment queue + filters | PRESENT | Auth member+ | `frontend/src/pages/[lang]/account/index.astro` | Moderation status bazli queue gorunumu. |
| Account | Account request submit/list | PRESENT | Auth member+ | `frontend/src/pages/[lang]/account/index.astro`, `app/src/api/account-request/controllers/account-request.js` | Deactivate/delete lifecycle var. |
| Account | Site language preference | PRESENT | Auth member+ | `frontend/src/pages/[lang]/account/index.astro`, `app/src/api/user-preference/controllers/user-preference.js` | `preferred_ui_language` persist ediliyor. |
| Account | Notification preferences | PRESENT | Auth member+ | `frontend/src/pages/[lang]/account/index.astro`, `app/src/api/user-preference/controllers/user-preference.js` | site/email/digest kontrolu var. |
| Account | Locale progress / translation visibility | PRESENT | Auth member+, detay role-gated | `frontend/src/pages/[lang]/account/index.astro` | Deploy komut hatirlaticilari dahil. |
| Account | Onboarding progress | PRESENT | Auth member+ | `frontend/src/pages/[lang]/account/index.astro`, `app/src/api/user-preference/controllers/user-preference.js` | adim bazli progress ve status var. |
| Account | Follows management | PRESENT | Auth member+ | `frontend/src/pages/[lang]/account/index.astro`, `app/src/api/user-follow/controllers/user-follow.js` | Community settinge bagli enable/disable. |
| Account | Saved lists management | PRESENT | Auth member+ | `frontend/src/pages/[lang]/account/index.astro`, `app/src/api/user-saved-list/controllers/user-saved-list.js` | list+item CRUD/toggle var. |
| Account | Community visibility settings | HIDDEN_OR_ROLE_GATED | Editor/Admin/Owner | `frontend/src/pages/[lang]/account/index.astro`, `app/src/api/community-setting/controllers/community-setting.js` | canWrite admin/owner; editor read-only sinyali var. |
| Dashboard | Strict single-view module/subsection nav | PRESENT | Auth member+, role-gated subsection | `frontend/src/pages/[lang]/dashboard/index.astro` | Focus mode + active module/subsection persistence var. |
| Dashboard | Moderation queue ops | HIDDEN_OR_ROLE_GATED | Editor/Admin/Owner | `frontend/src/pages/[lang]/dashboard/index.astro`, `app/src/api/blog-comment/controllers/blog-comment.js` | approve/reject/spam islemleri. |
| Dashboard | Report inbox ops | HIDDEN_OR_ROLE_GATED | Editor/Admin/Owner | `frontend/src/pages/[lang]/dashboard/index.astro`, `app/src/api/content-report/controllers/content-report.js` | reviewing/resolved/dismissed akisi. |
| Dashboard | Account request moderation | HIDDEN_OR_ROLE_GATED | Editor/Admin/Owner | `frontend/src/pages/[lang]/dashboard/index.astro`, `app/src/api/account-request/controllers/account-request.js` | moderation.set endpointine bagli. |
| Dashboard | Control center + owner ops cards | HIDDEN_OR_ROLE_GATED | Admin/Owner | `frontend/src/pages/[lang]/dashboard/index.astro` | release/smoke/runbook/strapi admin shortcutlari. |
| Dashboard | Release status / locale ops / activity feed | HIDDEN_OR_ROLE_GATED | Admin/Owner (kismi member) | `frontend/src/pages/[lang]/dashboard/index.astro` | operasyon sinyalleri tek panelde. |
| Community | Follow creator panel | PRESENT | Auth member+ (guest login CTA) | `frontend/src/components/community/FollowUserPanel.astro` | own profile guard + disabled state handling var. |
| Profile UI | `@[username]` mini-site UI | PRESENT | Guest/All | `frontend/src/pages/[lang]/@[username]/*` | UI metinleri i18n; UGC icerik translate edilmez. |
| Profile mirror | `/u/[username]` EN mirror | PRESENT | Guest/All | `frontend/src/pages/u/[username]/*` | Teknik mirror/fallback, noindex. |
| Blog engagement | Like/comment/report in post detail | PRESENT | Guest + Auth | `frontend/src/pages/[lang]/blog/[postSlug].astro`, `app/src/api/blog-comment/controllers/blog-comment.js`, `app/src/api/content-report/controllers/content-report.js` | Guest ve logged-in modlari ayrik. |
| Moderation backend | Blog post moderation lifecycle | PRESENT | Editor/Admin/Owner | `app/src/api/blog-post/controllers/blog-post.js` | draft/submitted/approved/rejected/spam/deleted. |
| Moderation backend | Blog comment moderation lifecycle | PRESENT | Editor/Admin/Owner | `app/src/api/blog-comment/controllers/blog-comment.js` | queue summary + stale metrics var. |
| Audit | Privileged action audit log | PRESENT | System + privileged actions | `app/src/modules/security/audit-log.js` | DB append + contract log channel=audit. |
| Logs/Obs | Structured log contract dual-write | PRESENT | System | `app/src/modules/domain-logging/*`, `tools/lib_log_contract.sh` | app/security/moderation/audit/release/dr taxonomy var. |
| Utility tools | Currency/Visa/Flights cards | PARTIAL | Guest/All | `frontend/src/components/RightTools.astro` | Context-aware UI + atlas link var; derin servis entegrasyonu gorulmedi. |
| Utility tools | Real-time flight deal engine | NOT_FOUND | - | code scan | Sadece planning hint/prompt metinleri goruldu. |
| Utility tools | Visa rules authoritative API | UNCERTAIN | - | `RightTools.astro` | UI tarafinda checklist starter var; backend feed kaniti net degil. |
| Utility tools | FX conversion engine | UNCERTAIN | - | `RightTools.astro` | UI card var; hesaplama/quote backend kaniti net degil. |
| Theme system | Light/Dark tokens + toggle | PRESENT | Guest/All | `frontend/src/styles/tokens.css`, `frontend/src/styles/global.css`, `frontend/src/components/ThemeToggle.astro` | Token tabanli theming var. |
| Layout system | Public/app shell + responsive drawer/sidebar | PRESENT | Guest/All | `frontend/src/layouts/BaseLayout.astro`, `frontend/src/layouts/AppShell.astro`, `frontend/src/components/LeftSidebar.astro` | Reusable shell yapisi mevcut. |
| Analytics | Consent-gated analytics foundation | PRESENT | Guest/All | `frontend/src/lib/analytics.ts`, `frontend/src/lib/consent/*`, `frontend/tests/analytics.spec.ts` | canonical event + session_ref yapisi goruluyor. |
| I18n governance | Source-of-truth + parity/fallback/hardcoded audits | PRESENT | Dev/Ops | `docs/I18N_GOVERNANCE.md`, `tools/i18n_*` | artifact tabanli governance mevcut. |

## 5. Atlas vs Blog vs App Separation

- Atlas ve Blog veri/route modeli kodda ayrik:
  - Atlas: `frontend/src/pages/[lang]/atlas/*`, `getAtlasPlaces`
  - Blog: `frontend/src/pages/[lang]/blog/*`, `getBlogPosts`
  - Ayri indexability kurallari: `frontend/src/lib/indexGate.ts`, `frontend/src/lib/ugcPostRules.ts`
- App/account/control experience ayri route katmaninda:
  - Account: `frontend/src/pages/[lang]/account/index.astro`
  - Dashboard: `frontend/src/pages/[lang]/dashboard/index.astro`
- UGC vs Atlas authoritative ayrimi backendde de var:
  - Blog post content source / moderation state: `app/src/api/blog-post/controllers/blog-post.js`
  - Atlas place translation/index gate: `frontend/src/lib/languageState.ts`, `frontend/src/lib/indexGate.ts`
- Sonuc: ayrim genel olarak net (`PRESENT`), ancak tek shell dili icinde cok fazla bilgi yogunlugu tasarimda ayristirma ihtiyaci doguruyor (`PARTIAL` tasarim riski).

## 6. Account / Dashboard / Control Findings

### Account
- Hesap sayfasi urunlestirilmis ve veri yogun: profile, comments, account requests, locale progress, language preference, notifications, onboarding, follows, saved lists, community visibility.
- Dosya: `frontend/src/pages/[lang]/account/index.astro`
- API baglantilari: `app/src/api/user-preference/controllers/user-preference.js`, `app/src/api/user-follow/controllers/user-follow.js`, `app/src/api/user-saved-list/controllers/user-saved-list.js`

### Dashboard
- Moduler IA ve role-gated single-view yapisi var.
- Top modules: account/content/community/ops/admin; subsection bazli lane filtering.
- Persistence anahtarlari: `geovito_dashboard_focus_mode_v1`, `geovito_dashboard_active_module_v1`, `geovito_dashboard_last_subsection_v1`.
- Dosya: `frontend/src/pages/[lang]/dashboard/index.astro`

### Control/Admin/Owner
- Sol menude role bazli gorunen admin araclari var (moderation/reports/account-requests/locale/control/ads/strapi).
- Dosya: `frontend/src/components/LeftSidebar.astro`
- Backendde privileged action audit yazimi var:
  - `community.settings.update`
  - `moderation.content_report.set`
  - `moderation.account_request.set`
  - `moderation.blog_post.set`
  - `moderation.blog_comment.set`
  - audit modulu: `app/src/modules/security/audit-log.js`

## 7. Theme & UI System Audit

### Dark/light durumu
- Light ve dark token seti mevcut: `frontend/src/styles/tokens.css`.
- `ThemeToggle` component var: `frontend/src/components/ThemeToggle.astro`.
- Global siniflar ve component stilleri tek dosyada yogunlasmis: `frontend/src/styles/global.css`.

### Component/layout tekrar kullanimi
- Reusable UI primitives var: `Card`, `Badge`, `BadgeGroup`, `Button`, `EmptyState`, `Accordion`, `Skeleton` (`frontend/src/components/ui/*`).
- Shell tekrar kullanimi var: `BaseLayout` + `AppShell` + `MainLayout`.
- Sonuc: temel design system omurgasi `PRESENT`.

### Tasarimi kolaylastiran altyapi
- Tokenized renk/yuzey yapisi.
- Ortak shell + responsive drawer/left-right columns.
- Role-gated data attributes ile davranis ayrimi.

### Tasarimi zorlastiran altyapi
- Tek dosyada cok buyuk dashboard/account sayfalari (okunabilirlik ve IA yogunlugu).
- `global.css` tek dosyada cok fazla domain style biriktiriyor; future split/planning gerekir.
- Bazi alanlarda public shell ile app shell gorsel ritmi tam ayrismamis.

## 8. Design Planning Risks

1. **Bilgi yogunlugu riski (Dashboard/Account)**  
   - Dosyalar cok buyuk ve cok amacli: `frontend/src/pages/[lang]/dashboard/index.astro`, `frontend/src/pages/[lang]/account/index.astro`.
2. **Route davranis drift riski (dil redirect)**  
   - Root redirect hardcoded dil listesi: `frontend/src/pages/index.astro`.
3. **Mirror profile bakim riski**  
   - `@[username]` ve `/u/[username]` parallel route seti: `frontend/src/pages/[lang]/@[username]/*`, `frontend/src/pages/u/[username]/*`.
4. **Utility card beklenti riski**  
   - UI var ama derin backend/3rd party entegrasyon kaniti sinirli: `frontend/src/components/RightTools.astro`.
5. **Role semantigi riski**  
   - Ayrik `moderator` rolu yerine editor/admin/owner karmasi; urun dili ve bilgi mimarisi netlestirme gerekir.
6. **Global CSS olcek riski**  
   - `frontend/src/styles/global.css` cok genis; uzun vadede zone-based ayristirma gerektirir.

## 9. Recommended Design Zones

| Zone | Mevcut durum | Complexity | Neden |
|---|---|---|---|
| Public homepage/discovery | PRESENT | Medium | Public-first hikaye ve shell sadeleştirmesi gerekli. |
| Atlas listing/detail | PRESENT | Medium-High | Hierarchy, state banner, mini TOC, related/travel kartlari tasarimda dikkat ister. |
| Blog/editorial | PRESENT | Medium | Detail sayfada engagement + moderation hint + noindex review katmanlari var. |
| Account | PRESENT | High | Cok ozellik tek sayfada; IA ve progressive disclosure kritik. |
| Control panel (dashboard) | PRESENT | High | Role-gated + strict single-view + cok kartli operasyon yuzeyi. |
| Utility/context panels | PARTIAL | Medium | Gercek servis kapsami belirsiz; tasarimda expectation management gerekir. |

## 10. Open Questions

1. Ayrik "moderator" roleu urun tarafinda istenecek mi, yoksa editor/admin/owner modeli kalici mi?
2. `/u/:username` mirror uzun vadede korunacak mi, yoksa tek canonical profile route setine mi gecilecek?
3. Root dil redirect (`frontend/src/pages/index.astro`) registry helper ile birebir senkronize edilmeli mi?
4. Utility cards (currency/visa/flights) icin roadmap hangi seviyede: UI helper mi kalacak, yoksa gercek veri saglayicilara baglanacak mi?
5. Dashboard ve account sayfalarinda bilgi yogunlugu azaltma icin resmi IA oncelik sirası nedir?
6. Legal iceriklerde non-EN tam lokalizasyon hedefi var mi, yoksa EN fallback stratejisi mi surecek?
7. Owner/admin operasyon kartlari icin hangi metrikler birinci sinif KPI olarak sabitlenecek?

---

## Appendix: Verification scope

- Kod taramasi frontend + backend route/controller/layout/component seviyesinde yapildi.
- Bu raporda "PRESENT" olarak isaretlenen maddeler, dosya seviyesinde dogrudan kanitlanan davranislara dayanir.
- "UNCERTAIN" maddeler bilerek korunmustur; runtime test olmadan kesin var/yok demek dogru olmaz.
