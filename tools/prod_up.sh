#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=============================================================="
echo "GEOVITO PROD MODE: docker compose up -d --build"
echo "=============================================================="

docker compose up -d --build
docker compose ps
