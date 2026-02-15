#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

IMAGE="node:20-bullseye"
ALLOWED_PATH="frontend/pnpm-lock.yaml"

if ! command -v docker >/dev/null 2>&1; then
  echo "FAIL: docker komutu bulunamadi."
  exit 1
fi

capture_changed_paths() {
  git status --porcelain=v1 | awk '{
    if ($1 == "??") {
      print $2;
    } else if (NF >= 4 && $(NF-1) == "->") {
      print $NF;
    } else {
      print $2;
    }
  }' | sed '/^$/d' | sort -u
}

before_file="$(mktemp)"
after_file="$(mktemp)"
trap 'rm -f "$before_file" "$after_file"' EXIT

capture_changed_paths > "$before_file"

echo "=============================================================="
echo "GEOVITO LOCKFILE UPDATE (PNPM)"
echo "Image: ${IMAGE}"
echo "Allowed change: ${ALLOWED_PATH}"
echo "=============================================================="

docker run --rm \
  -u "$(id -u):$(id -g)" \
  -v "$ROOT_DIR":/work \
  -w /work/frontend \
  "$IMAGE" \
  bash -lc "npx -y pnpm@9.15.4 install --lockfile-only --no-frozen-lockfile"

capture_changed_paths > "$after_file"

new_paths="$(comm -13 "$before_file" "$after_file" || true)"
unexpected="$(echo "$new_paths" | sed '/^$/d' | grep -v "^${ALLOWED_PATH}$" || true)"

if [[ -n "$unexpected" ]]; then
  echo "FAIL: update_lockfile beklenmeyen dosyalari degistirdi:"
  echo "$unexpected"
  echo "Sadece ${ALLOWED_PATH} degisebilir."
  exit 1
fi

echo "PASS: Lockfile update tamamlandi (yalnizca ${ALLOWED_PATH} izinli)."
