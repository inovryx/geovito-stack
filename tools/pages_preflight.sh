#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

IMAGE="node:20-bullseye"

if ! command -v docker >/dev/null 2>&1; then
  echo "FAIL: docker komutu bulunamadi."
  exit 1
fi

check_permission_footguns() {
  local -a candidates=()
  local -a issues=()
  local path owner_uid

  shopt -s nullglob
  candidates+=("frontend/node_modules")
  candidates+=("frontend/node_modules/.vite")
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
    echo "FAIL: Preflight oncesi izin/sahiplik problemi tespit edildi:"
    for path in "${issues[@]}"; do
      echo " - $path"
    done
    echo ""
    echo "Duzenleme komutu (kopyala-calistir):"
    echo "docker run --rm -v \"$ROOT_DIR\":/work alpine:3.20 sh -lc \"chown -R $(id -u):$(id -g) /work/frontend && rm -rf /work/frontend/dist* /work/frontend/node_modules/.vite\""
    exit 2
  fi
}

echo "=============================================================="
echo "GEOVITO PAGES PREFLIGHT"
echo "Image: ${IMAGE}"
echo "=============================================================="

check_permission_footguns

docker_env=()
for var_name in STRAPI_URL PUBLIC_STRAPI_URL ALLOW_LOCALHOST_STRAPI PUBLIC_SITE_URL CF_PAGES CF_PAGES_BRANCH CF_PAGES_COMMIT_SHA NODE_ENV CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET; do
  if [[ -n "${!var_name:-}" ]]; then
    docker_env+=(-e "${var_name}=${!var_name}")
  fi
done

docker run --rm \
  --network=host \
  -u "$(id -u):$(id -g)" \
  "${docker_env[@]}" \
  -v "$ROOT_DIR":/work \
  -w /work/frontend \
  "$IMAGE" \
  bash -lc "npx -y pnpm@9.15.4 install --frozen-lockfile && npx -y pnpm@9.15.4 run build"

echo "=============================================================="
echo "PASS: Cloudflare Pages preflight basariyla tamamlandi."
echo "=============================================================="
