#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-}"
BASE_URL="${BASE_URL%/}"
EXPECTED_SHA7="${EXPECTED_SHA7:-}"
EXPECTED_SHA="${EXPECTED_SHA:-}"
CREATOR_USERNAME="${CREATOR_USERNAME:-}"
CREATOR_LANG="${CREATOR_LANG:-en}"
CF_ACCESS_CLIENT_ID="${CF_ACCESS_CLIENT_ID:-}"
CF_ACCESS_CLIENT_SECRET="${CF_ACCESS_CLIENT_SECRET:-}"

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

fail() {
  echo "FAIL: $1"
  exit 1
}

access_hint() {
  cat <<'EOF'
Cloudflare Access korumasi acik olabilir.
Service token ile tekrar calistir:
  CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... BASE_URL=https://geovito.com bash tools/post_deploy_smoke.sh
EOF
}

fail_with_access_hint_if_needed() {
  local code="$1"
  local label="$2"
  if [[ "$code" == "401" || "$code" == "403" ]]; then
    echo "FAIL: ${label} status ${code}"
    access_hint
    exit 1
  fi
}

looks_like_access_gate_body() {
  local file="$1"
  grep -Eqi 'cloudflare access|one-time pin|cf-access|<!doctype html|<html' "$file"
}

fetch() {
  local url="$1"
  local out="$2"
  shift 2
  local code
  code="$(curl -sS -L --max-time 15 -o "$out" -w '%{http_code}' "$@" "$url" || true)"
  echo "$code"
}

fetch_no_follow() {
  local url="$1"
  local out="$2"
  shift 2
  local code
  code="$(curl -sS --max-time 15 -D "$out" -o /dev/null -w '%{http_code}' "$@" "$url" || true)"
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

normalize_username() {
  local value="$1"
  value="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
  value="$(echo "$value" | sed -E 's/[^a-z0-9._-]//g')"
  echo "$value"
}

normalize_lang() {
  local value="$1"
  value="$(echo "$value" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z-]//g')"
  case "$value" in
    en|tr|de|es|ru|zh-cn|fr) echo "$value" ;;
    *) echo "en" ;;
  esac
}

curl_auth_args=()
if [[ -n "$CF_ACCESS_CLIENT_ID" || -n "$CF_ACCESS_CLIENT_SECRET" ]]; then
  if [[ -z "$CF_ACCESS_CLIENT_ID" || -z "$CF_ACCESS_CLIENT_SECRET" ]]; then
    fail "CF_ACCESS_CLIENT_ID ve CF_ACCESS_CLIENT_SECRET birlikte verilmelidir."
  fi
  curl_auth_args+=(-H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}")
  curl_auth_args+=(-H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}")
fi

echo "=============================================================="
echo "GEOVITO POST-DEPLOY SMOKE"
echo "BASE_URL=${BASE_URL}"
echo "=============================================================="

if [[ -z "$BASE_URL" ]]; then
  fail "BASE_URL is required. Example: BASE_URL=https://www.geovito.com"
fi

# 1) build fingerprint
fingerprint_file="$TMP_DIR/build_fingerprint.json"
code="$(fetch "${BASE_URL}/.well-known/geovito-build.json" "$fingerprint_file" "${curl_auth_args[@]}")"
fail_with_access_hint_if_needed "$code" "/.well-known/geovito-build.json"
[[ "$code" == "200" ]] || fail "build fingerprint status ${code}"

build_sha7="$(extract_json_string "$fingerprint_file" "build_sha7")"
if [[ -z "$build_sha7" ]]; then
  if looks_like_access_gate_body "$fingerprint_file"; then
    echo "FAIL: build fingerprint response is not API JSON (possible Access gate page)"
    access_hint
    exit 1
  fi
  fail "build fingerprint missing build_sha7"
fi

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
code="$(fetch "${BASE_URL}/sitemap.xml" "$sitemap_file" "${curl_auth_args[@]}")"
fail_with_access_hint_if_needed "$code" "/sitemap.xml"
[[ "$code" == "200" ]] || fail "sitemap.xml status ${code}"
echo "PASS: /sitemap.xml -> 200"

# 3) pilot EN indexable
pilot_en="/en/atlas/italy-pilot/"
pilot_en_file="$TMP_DIR/pilot_en.html"
code="$(fetch "${BASE_URL}${pilot_en}" "$pilot_en_file" "${curl_auth_args[@]}")"
fail_with_access_hint_if_needed "$code" "${pilot_en}"
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
code="$(fetch "${BASE_URL}${pilot_de}" "$pilot_de_file" "${curl_auth_args[@]}")"
fail_with_access_hint_if_needed "$code" "${pilot_de}"
[[ "$code" == "200" ]] || fail "pilot DE status ${code}"
assert_contains "$pilot_de_file" 'meta name="robots" content="noindex,nofollow"' "pilot DE robots not noindex,nofollow"
pilot_de_canonical="$(extract_canonical "$pilot_de_file")"
[[ -n "$pilot_de_canonical" ]] || fail "pilot DE canonical missing"
if [[ "$(normalize_url "$pilot_de_canonical")" != "$(normalize_url "${BASE_URL}${pilot_en}")" ]]; then
  fail "pilot DE canonical not EN (got ${pilot_de_canonical})"
fi
echo "PASS: ${pilot_de} -> noindex + canonical EN"

# 5) optional creator mini-site checks
creator_username="$(normalize_username "$CREATOR_USERNAME")"
if [[ -n "$creator_username" ]]; then
  creator_lang="$(normalize_lang "$CREATOR_LANG")"
  creator_home="/${creator_lang}/@${creator_username}/"
  creator_home_file="$TMP_DIR/creator_home.html"
  code="$(fetch "${BASE_URL}${creator_home}" "$creator_home_file" "${curl_auth_args[@]}")"
  fail_with_access_hint_if_needed "$code" "${creator_home}"
  [[ "$code" == "200" ]] || fail "creator home status ${code}"
  assert_contains "$creator_home_file" 'meta name="robots" content="noindex,nofollow"' "creator home robots not noindex,nofollow"
  creator_canonical="$(extract_canonical "$creator_home_file")"
  [[ -n "$creator_canonical" ]] || fail "creator home canonical missing"
  if [[ "$(normalize_url "$creator_canonical")" != "$(normalize_url "${BASE_URL}${creator_home}")" ]]; then
    fail "creator home canonical not self (got ${creator_canonical})"
  fi
  echo "PASS: ${creator_home} -> noindex + canonical self"

  creator_alias="/@${creator_username}"
  creator_alias_headers="$TMP_DIR/creator_alias_headers.txt"
  code="$(fetch_no_follow "${BASE_URL}${creator_alias}" "$creator_alias_headers" "${curl_auth_args[@]}")"
  fail_with_access_hint_if_needed "$code" "${creator_alias}"
  [[ "$code" == "307" ]] || fail "creator alias status expected 307, got ${code}"
  creator_location="$(grep -i '^location:' "$creator_alias_headers" | head -n1 | sed -E 's/^[Ll]ocation:[[:space:]]*//; s/\r$//')"
  [[ -n "$creator_location" ]] || fail "creator alias location header missing"
  if [[ "$(normalize_url "$creator_location")" != "$(normalize_url "${BASE_URL}${creator_home}")" ]]; then
    fail "creator alias location mismatch (got ${creator_location})"
  fi
  echo "PASS: ${creator_alias} -> 307 ${creator_home}"
else
  echo "SKIP: creator mini-site checks (set CREATOR_USERNAME to enable)"
fi

echo "=============================================================="
echo "PASS: Post-deploy smoke checks completed."
echo "=============================================================="
