#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://www.geovito.com}"
BASE_URL="${BASE_URL%/}"

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

fail() {
  echo "FAIL: $1"
  exit 1
}

fetch() {
  local url="$1"
  local out="$2"
  local code
  code="$(curl -sS -L -o "$out" -w '%{http_code}' "$url" || true)"
  echo "$code"
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if ! grep -Eqi "$pattern" "$file"; then
    fail "$label"
  fi
}

echo "=============================================================="
echo "GEOVITO POST-DEPLOY SMOKE"
echo "BASE_URL=${BASE_URL}"
echo "=============================================================="

# 1) sitemap
sitemap_file="$TMP_DIR/sitemap.xml"
code="$(fetch "${BASE_URL}/sitemap.xml" "$sitemap_file")"
[[ "$code" == "200" ]] || fail "sitemap.xml status ${code}"
echo "PASS: /sitemap.xml -> 200"

# 2) pilot EN indexable
pilot_en="/en/atlas/italy-pilot/"
pilot_en_file="$TMP_DIR/pilot_en.html"
code="$(fetch "${BASE_URL}${pilot_en}" "$pilot_en_file")"
[[ "$code" == "200" ]] || fail "pilot EN status ${code}"
assert_contains "$pilot_en_file" 'meta name="robots" content="index,follow"' "pilot EN robots not index,follow"
assert_contains "$pilot_en_file" "rel=\"canonical\" href=\"${BASE_URL}${pilot_en}\"" "pilot EN canonical not self"
echo "PASS: ${pilot_en} -> indexable + canonical self"

# 3) pilot non-EN fallback
pilot_de="/de/atlas/italy-pilot/"
pilot_de_file="$TMP_DIR/pilot_de.html"
code="$(fetch "${BASE_URL}${pilot_de}" "$pilot_de_file")"
[[ "$code" == "200" ]] || fail "pilot DE status ${code}"
assert_contains "$pilot_de_file" 'meta name="robots" content="noindex,nofollow"' "pilot DE robots not noindex,nofollow"
assert_contains "$pilot_de_file" "rel=\"canonical\" href=\"${BASE_URL}${pilot_en}\"" "pilot DE canonical not EN"
echo "PASS: ${pilot_de} -> noindex + canonical EN"

# 4) ops status
ops_status="/en/ops/status/"
ops_file="$TMP_DIR/ops_status.html"
code="$(fetch "${BASE_URL}${ops_status}" "$ops_file")"
[[ "$code" == "200" ]] || fail "ops status ${code}"
assert_contains "$ops_file" 'meta name="robots" content="noindex,nofollow"' "ops status robots not noindex,nofollow"
assert_contains "$ops_file" 'System Status' "ops status title not found"
echo "PASS: ${ops_status} -> noindex + System Status"

echo "=============================================================="
echo "PASS: Post-deploy smoke checks completed."
echo "=============================================================="
