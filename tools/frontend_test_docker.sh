#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.49.1-jammy"

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

if [[ "${SKIP_STRAPI:-0}" != "1" ]]; then
  echo "INFO: Strapi ayaga kaldiriliyor (SKIP_STRAPI=1 degil)."
  docker compose up -d strapi
else
  echo "INFO: SKIP_STRAPI=1 oldugu icin Strapi baslatma adimi atlandi."
fi

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

