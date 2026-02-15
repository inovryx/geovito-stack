#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.49.1-jammy"
STRAPI_HTTP_BASE="${STRAPI_HTTP_BASE:-http://127.0.0.1:1337}"

echo "=============================================================="
echo "GEOVITO FRONTEND TEST (DOCKER PLAYWRIGHT)"
echo "=============================================================="

if [[ "$(id -u)" -eq 0 ]]; then
  echo "FAIL: Bu script root olarak calistirilmamalidir."
  echo "Lutfen normal bir kullanici ile tekrar calistirin."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "FAIL: docker komutu bulunamadi."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "FAIL: docker compose kullanilabilir degil."
  exit 1
fi

check_permission_footguns() {
  local -a candidates=()
  local -a issues=()
  local path owner_uid

  shopt -s nullglob
  candidates+=("frontend/node_modules")
  candidates+=("frontend/test-results")
  candidates+=("frontend/playwright-report")
  candidates+=("frontend"/dist*)
  shopt -u nullglob

  for path in "${candidates[@]}"; do
    [[ -e "$path" ]] || continue
    owner_uid="$(stat -c '%u' "$path" 2>/dev/null || true)"
    if [[ "$owner_uid" == "0" || ! -w "$path" ]]; then
      issues+=("$path")
    fi
  done

  if [[ "${#issues[@]}" -gt 0 ]]; then
    echo "FAIL: Frontend artifact izin/sahiplik problemi tespit edildi:"
    for path in "${issues[@]}"; do
      echo " - $path"
    done
    echo ""
    echo "Duzenleme komutu (kopyala-calistir):"
    echo "sudo chown -R \$(whoami):\$(id -gn) frontend && rm -rf frontend/dist* frontend/test-results frontend/playwright-report frontend/node_modules"
    echo ""
    echo "Bu duzeltmeden sonra scripti tekrar calistirin."
    exit 2
  fi
}

check_permission_footguns

read_data_count() {
  docker run --rm -i node:20-alpine node -e 'const fs=require("fs");const input=fs.readFileSync(0,"utf8");let payload={};try{payload=JSON.parse(input);}catch{process.stdout.write("0");process.exit(0);}const count=Array.isArray(payload.data)?payload.data.length:0;process.stdout.write(String(count));'
}

assert_place_slug_exists() {
  local slug="$1"
  local response
  response="$(curl -sS --fail --get "${STRAPI_HTTP_BASE}/api/atlas-places" \
    --data-urlencode "filters[slug][\$eq]=${slug}" \
    --data-urlencode "pagination[pageSize]=1")"

  local count
  count="$(printf '%s' "$response" | read_data_count)"
  if [[ "$count" -lt 1 ]]; then
    echo "FAIL: required search fixture missing (slug=${slug})"
    echo "Fix: ALLOW_MOCK_SEED=true bash tools/mock_data.sh seed"
    exit 3
  fi
}

prepare_search_fixture() {
  if [[ "${SKIP_MOCK_SEED:-0}" == "1" ]]; then
    echo "INFO: SKIP_MOCK_SEED=1 oldugu icin mock seed adimi atlandi."
  else
    echo "INFO: Search fixture icin mock veri yeniden yukleniyor."
    bash tools/mock_data.sh clear >/dev/null || true
    ALLOW_MOCK_SEED=true bash tools/mock_data.sh seed >/dev/null
  fi

  echo "INFO: Search fixture dogrulamasi (US/NYC/Berlin)."
  assert_place_slug_exists "united-states"
  assert_place_slug_exists "new-york-city"
  assert_place_slug_exists "berlin"
}

if [[ "${SKIP_STRAPI:-0}" != "1" ]]; then
  echo "INFO: Strapi ayaga kaldiriliyor (SKIP_STRAPI=1 degil)."
  docker compose up -d strapi
else
  echo "INFO: SKIP_STRAPI=1 oldugu icin Strapi baslatma adimi atlandi."
fi

prepare_search_fixture

docker run --rm \
  --network=host \
  -u "$(id -u):$(id -g)" \
  -v "$PWD":/work \
  -w /work/frontend \
  "$PLAYWRIGHT_IMAGE" \
  bash -lc "corepack pnpm@9.15.4 install --frozen-lockfile && corepack pnpm@9.15.4 exec playwright test --reporter=line"

echo "=============================================================="
echo "PASS: Docker Playwright full frontend suite basariyla tamamlandi."
echo "=============================================================="
