#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-}"
BASE_URL="${BASE_URL%/}"
EXPECTED_SHA7="${EXPECTED_SHA7:-}"
EXPECTED_SHA="${EXPECTED_SHA:-}"

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
  shift 2
  local code
  code="$(curl -sS -L --max-time 15 -o "$out" -w '%{http_code}' "$@" "$url" || true)"
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

extract_canonical() {
  local file="$1"
  local link
  link="$(grep -Eio '<link[^>]+rel="canonical"[^>]*>' "$file" | head -n1 || true)"
  if [[ -z "$link" ]]; then
    echo ""
    return
  fi
  echo "$link" | sed -E 's/.*href="([^"]+)".*/\1/i'
}

extract_json_string() {
  local file="$1"
  local key="$2"
  tr -d '\n\r' < "$file" | sed -nE "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\\1/p"
}

normalize_sha7() {
  local value="$1"
  value="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
  if [[ "$value" == "unknown" ]]; then
    echo "unknown"
    return
  fi
  echo "${value:0:7}"
}

normalize_url() {
  local value="$1"
  value="${value%/}"
  echo "$value"
}

echo "=============================================================="
echo "GEOVITO POST-DEPLOY SMOKE"
echo "BASE_URL=${BASE_URL}"
echo "=============================================================="

if [[ -z "$BASE_URL" ]]; then
  fail "BASE_URL is required. Example: BASE_URL=https://www.geovito.com"
fi

# 1) build fingerprint
fingerprint_file="$TMP_DIR/build_fingerprint.json"
code="$(fetch "${BASE_URL}/.well-known/geovito-build.json" "$fingerprint_file")"
[[ "$code" == "200" ]] || fail "build fingerprint status ${code}"

build_sha7="$(extract_json_string "$fingerprint_file" "build_sha7")"
[[ -n "$build_sha7" ]] || fail "build fingerprint missing build_sha7"

if [[ -n "$EXPECTED_SHA7" ]]; then
  expected7="$(normalize_sha7 "$EXPECTED_SHA7")"
  got7="$(normalize_sha7 "$build_sha7")"
  [[ "$got7" == "$expected7" ]] || fail "build_sha7 mismatch (expected ${expected7}, got ${got7})"
fi

if [[ -n "$EXPECTED_SHA" ]]; then
  expected_from_full="$(normalize_sha7 "$EXPECTED_SHA")"
  got7="$(normalize_sha7 "$build_sha7")"
  [[ "$got7" == "$expected_from_full" ]] || fail "build_sha7 mismatch (expected ${expected_from_full}, got ${got7})"
fi

echo "PASS: /.well-known/geovito-build.json -> 200 (build_sha7=${build_sha7})"

# 2) sitemap
sitemap_file="$TMP_DIR/sitemap.xml"
code="$(fetch "${BASE_URL}/sitemap.xml" "$sitemap_file")"
[[ "$code" == "200" ]] || fail "sitemap.xml status ${code}"
echo "PASS: /sitemap.xml -> 200"

# 3) pilot EN indexable
pilot_en="/en/atlas/italy-pilot/"
pilot_en_file="$TMP_DIR/pilot_en.html"
code="$(fetch "${BASE_URL}${pilot_en}" "$pilot_en_file")"
[[ "$code" == "200" ]] || fail "pilot EN status ${code}"
assert_contains "$pilot_en_file" 'meta name="robots" content="index,follow"' "pilot EN robots not index,follow"
pilot_en_canonical="$(extract_canonical "$pilot_en_file")"
[[ -n "$pilot_en_canonical" ]] || fail "pilot EN canonical missing"
if [[ "$(normalize_url "$pilot_en_canonical")" != "$(normalize_url "${BASE_URL}${pilot_en}")" ]]; then
  fail "pilot EN canonical not self (got ${pilot_en_canonical})"
fi
echo "PASS: ${pilot_en} -> indexable + canonical self"

# 4) pilot non-EN fallback
pilot_de="/de/atlas/italy-pilot/"
pilot_de_file="$TMP_DIR/pilot_de.html"
code="$(fetch "${BASE_URL}${pilot_de}" "$pilot_de_file")"
[[ "$code" == "200" ]] || fail "pilot DE status ${code}"
assert_contains "$pilot_de_file" 'meta name="robots" content="noindex,nofollow"' "pilot DE robots not noindex,nofollow"
pilot_de_canonical="$(extract_canonical "$pilot_de_file")"
[[ -n "$pilot_de_canonical" ]] || fail "pilot DE canonical missing"
if [[ "$(normalize_url "$pilot_de_canonical")" != "$(normalize_url "${BASE_URL}${pilot_en}")" ]]; then
  fail "pilot DE canonical not EN (got ${pilot_de_canonical})"
fi
echo "PASS: ${pilot_de} -> noindex + canonical EN"

echo "=============================================================="
echo "PASS: Post-deploy smoke checks completed."
echo "=============================================================="
