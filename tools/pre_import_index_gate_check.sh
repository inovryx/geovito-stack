#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DIST_DIR="$ROOT_DIR/frontend/dist"
FAIL_COUNT=0

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

require_file() {
  local target="$1"
  local label="$2"
  if [[ -f "$target" ]]; then
    pass "$label"
  else
    fail "$label (missing file: $target)"
  fi
}

assert_contains() {
  local target="$1"
  local pattern="$2"
  local label="$3"
  if rg -q "$pattern" "$target"; then
    pass "$label"
  else
    fail "$label (pattern not found: $pattern)"
  fi
}

assert_not_contains() {
  local target="$1"
  local pattern="$2"
  local label="$3"
  if rg -q "$pattern" "$target"; then
    fail "$label (unexpected pattern found: $pattern)"
  else
    pass "$label"
  fi
}

echo "=============================================================="
echo "GEOVITO PRE-IMPORT INDEX GATE CHECK"
echo "=============================================================="

docker compose up -d strapi >/dev/null
ALLOW_MOCK_SEED=true bash tools/mock_data.sh seed >/dev/null
bash tools/prod_smoke_frontend.sh >/dev/null

MOCK_TR="$DIST_DIR/en/atlas/turkiye/index.html"
MOCK_US="$DIST_DIR/en/atlas/united-states/index.html"
MOCK_DE="$DIST_DIR/en/atlas/germany/index.html"
MOCK_NON_EN="$DIST_DIR/es/atlas/germany/index.html"
MOCK_TR_LOCALE="$DIST_DIR/tr/atlas/turkiye/index.html"
PILOT_EN="$DIST_DIR/en/atlas/italy-pilot/index.html"
PILOT_NON_EN="$DIST_DIR/de/atlas/italy-pilot/index.html"
REGION_MOCK_EN="$DIST_DIR/en/regions/tr-mediterranean-region/index.html"
REGION_PILOT_EN="$DIST_DIR/en/regions/it-pilot-region/index.html"
REGION_PILOT_NON_EN="$DIST_DIR/de/regions/it-pilot-region/index.html"
SITEMAP_INDEX="$DIST_DIR/sitemap.xml"
SITEMAP_CHUNK_FILE="$DIST_DIR/sitemaps/atlas-en-1.xml"

require_file "$MOCK_TR" "Mock TR page rendered"
require_file "$MOCK_US" "Mock US page rendered"
require_file "$MOCK_DE" "Mock DE page rendered"
require_file "$MOCK_NON_EN" "Mock non-EN page rendered"
require_file "$MOCK_TR_LOCALE" "Mock TR locale page rendered"
require_file "$PILOT_EN" "Pilot EN page rendered"
require_file "$PILOT_NON_EN" "Pilot non-EN page rendered"
require_file "$REGION_MOCK_EN" "Region mock EN page rendered"
require_file "$REGION_PILOT_EN" "Region pilot EN page rendered"
require_file "$REGION_PILOT_NON_EN" "Region pilot non-EN page rendered"
require_file "$SITEMAP_INDEX" "Sitemap index generated"
require_file "$SITEMAP_CHUNK_FILE" "Sitemap chunk generated"

assert_contains "$MOCK_TR" '<meta name="robots" content="noindex,nofollow">' "Mock TR robots noindex"
assert_contains "$MOCK_TR" 'state-banner mock' "Mock TR banner"
assert_contains "$MOCK_US" '<meta name="robots" content="noindex,nofollow">' "Mock US robots noindex"
assert_contains "$MOCK_US" 'state-banner mock' "Mock US banner"
assert_contains "$MOCK_DE" '<meta name="robots" content="noindex,nofollow">' "Mock DE robots noindex"
assert_contains "$MOCK_DE" 'state-banner mock' "Mock DE banner"

assert_contains "$MOCK_NON_EN" '<meta name="robots" content="noindex,nofollow">' "Mock non-EN robots noindex"
assert_contains "$MOCK_NON_EN" 'state-banner fallback' "Mock non-EN fallback banner"
assert_contains "$MOCK_NON_EN" 'href="https://www.geovito.com/en/atlas/germany"' "Mock non-EN canonical to EN complete"
assert_contains "$MOCK_TR_LOCALE" '<meta name="robots" content="noindex,nofollow">' "Mock TR locale robots noindex"
assert_contains "$MOCK_TR_LOCALE" 'href="https://www.geovito.com/en/atlas/turkiye"' "Mock TR locale canonical to EN complete"

assert_contains "$PILOT_EN" '<meta name="robots" content="index,follow">' "Pilot EN robots indexable"
assert_contains "$PILOT_EN" 'href="https://www.geovito.com/en/atlas/italy-pilot"' "Pilot EN canonical self"
assert_not_contains "$PILOT_EN" 'state-banner mock' "Pilot EN has no MOCK banner"

assert_contains "$PILOT_NON_EN" '<meta name="robots" content="noindex,nofollow">' "Pilot non-EN robots noindex"
assert_contains "$PILOT_NON_EN" 'state-banner fallback' "Pilot non-EN fallback banner"
assert_contains "$PILOT_NON_EN" 'href="https://www.geovito.com/en/atlas/italy-pilot"' "Pilot non-EN canonical to EN complete"
assert_not_contains "$PILOT_NON_EN" 'state-banner mock' "Pilot non-EN has no MOCK banner"

assert_contains "$REGION_MOCK_EN" '<meta name="robots" content="noindex,nofollow">' "Region mock EN robots noindex"
assert_contains "$REGION_MOCK_EN" 'state-banner mock' "Region mock EN banner"
assert_contains "$REGION_PILOT_EN" '<meta name="robots" content="index,follow">' "Region pilot EN robots indexable"
assert_contains "$REGION_PILOT_EN" 'href="https://www.geovito.com/en/regions/it-pilot-region"' "Region pilot EN canonical self"
assert_not_contains "$REGION_PILOT_EN" 'state-banner mock' "Region pilot EN has no MOCK banner"
assert_contains "$REGION_PILOT_NON_EN" '<meta name="robots" content="noindex,nofollow">' "Region pilot non-EN robots noindex"
assert_contains "$REGION_PILOT_NON_EN" 'state-banner fallback' "Region pilot non-EN fallback banner"
assert_contains "$REGION_PILOT_NON_EN" 'href="https://www.geovito.com/en/regions/it-pilot-region"' "Region pilot non-EN canonical to EN complete"

assert_contains "$SITEMAP_INDEX" '/sitemaps/atlas-en-1.xml' "Sitemap index references atlas EN chunk"

assert_contains "$SITEMAP_CHUNK_FILE" 'https://www.geovito.com/en/atlas/italy-pilot' "Sitemap includes pilot EN"
assert_contains "$SITEMAP_CHUNK_FILE" 'https://www.geovito.com/en/regions/it-pilot-region' "Sitemap includes region pilot EN"
assert_not_contains "$SITEMAP_CHUNK_FILE" 'https://www.geovito.com/en/atlas/turkiye' "Sitemap excludes mock TR"
assert_not_contains "$SITEMAP_CHUNK_FILE" 'https://www.geovito.com/en/atlas/united-states' "Sitemap excludes mock US"
assert_not_contains "$SITEMAP_CHUNK_FILE" 'https://www.geovito.com/en/atlas/germany' "Sitemap excludes mock DE"
assert_not_contains "$SITEMAP_CHUNK_FILE" 'https://www.geovito.com/de/atlas/italy-pilot' "Sitemap excludes pilot non-complete language"
assert_not_contains "$SITEMAP_CHUNK_FILE" 'https://www.geovito.com/de/regions/it-pilot-region' "Sitemap excludes region pilot non-complete language"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "Index gate checks failed: $FAIL_COUNT"
  exit 1
fi

echo "All pre-import index gate checks passed."
