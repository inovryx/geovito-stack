#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=============================================================="
echo "GEOVITO PROD MODE: frontend smoke (i18n + build)"
echo "=============================================================="

HOST_UID_GID="$(id -u):$(id -g)"

docker compose run --rm --user "$HOST_UID_GID" frontend sh -lc "npm install && npm run i18n:check && npm run build"
