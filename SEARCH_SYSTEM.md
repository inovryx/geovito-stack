# Geovito Search System

## 1) Search Role
Search is a derived layer, never canonical truth.
Canonical authority remains Strapi domain models.

## 2) Domain Separation
Independent search contracts are kept for:
- Atlas
- Blog
- (future) system/help

No mixed ranking policy between Atlas and Blog.

## 3) Index Gate Alignment
Search index eligibility must follow frontend/SEO gate rules.

### Atlas + RegionGroup eligibility
- EN only
- translation status must be `complete`
- `mock=false`

Non-EN or non-complete variants are excluded from indexable output.

## 4) Sitemap Alignment
Sitemap generation follows the same gate:
- only EN complete non-mock Atlas/RegionGroup URLs are included
- non-indexable variants are excluded

## 5) Top Cities Logic
"Top cities" is a cross-country city-class list, not an admin-level bucket.
- Include `place_type` in (`city`, `locality`) as same class
- Example: Istanbul and New York can appear in same city-class output
- admin levels remain hierarchy metadata, not top-city segmentation key

## 6) Contracts and Tooling
Contracts:
- `services/search-indexer/contracts/atlas-document.v1.schema.json`
- `services/search-indexer/contracts/blog-document.v1.schema.json`
- `services/search-indexer/contracts/search-upsert-event.v1.schema.json`

Export utility:
- `tools/export_search_documents.sh`
- `tools/export_search_documents.js`

Current export behavior for Atlas:
- emits EN complete documents
- marks indexability using strict gate + mock check
- preserves place identity via immutable `place_id`

## 7) CountryProfile + RegionGroup Context
Search transformation can use:
- `country_profile` level labels/rules for normalization
- `region_group` membership as additive metadata

This is additive enrichment only; it must not mutate canonical Atlas hierarchy.

## 8) Not In Scope (Current Phase)
- real-time external import-driven indexing
- crawler jobs
- monetization-tuned ranking

Import stays dormant until controlled activation.
