# Geovito Search System

## 1) Search Role
Search is derived data, never canonical truth.
Canonical source remains Strapi domain models.

## 2) Domain Separation
Separate contracts/ranking domains:
- Atlas
- Blog
- (future) system/help

No mixed ranking rules between Atlas and Blog.

## 3) Index Gate Alignment
Search eligibility must match SEO gate.

Atlas + RegionGroup indexable only when:
- `language=en`
- translation `status=complete`
- `mock=false`

Non-EN, draft/missing, runtime, and mock variants are excluded from indexable output.

## 4) Sitemap Alignment
Sitemap and search must stay consistent:
- include only EN complete non-mock URLs
- exclude non-complete and non-EN variants
- include region pages only when indexable by same rule

## 5) Metadata Enrichment (Contract-safe)
Atlas export can include:
- `place_type`
- `place_type_label` (from `country_profile.label_mapping`)
- `region`
- `city_class` (from `country_profile.city_like_levels`)

This is additive metadata only; parent-chain authority remains Atlas core.

## 6) City-like / Trending Behavior
`country_profile.city_like_levels` drives city-class lists.
This allows cross-country city-class outputs (example: Istanbul and New York) even when source admin levels differ.

## 7) Contracts and Tools
Contracts:
- `services/search-indexer/contracts/atlas-document.v1.schema.json`
- `services/search-indexer/contracts/blog-document.v1.schema.json`
- `services/search-indexer/contracts/search-upsert-event.v1.schema.json`

Tools:
- `tools/export_search_documents.sh`
- `tools/export_blog_documents.sh`
- `tools/suggest_internal_links.js`
- `tools/suggest_internal_links.sh`

## 8) Internal Link Suggestions (Offline)
Link suggestions are generated offline from exported data:
- produces JSON/TSV reports
- supports TR/EN mention matching with optional country context
- target URLs are EN canonical Atlas URLs
- no auto-write to Strapi, no auto-publish

## 9) Out of Scope (Current Phase)
- real-time crawler import indexing
- import execution hooks
- AI provider dependent ranking
