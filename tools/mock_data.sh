#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-}"

if [[ "$MODE" != "seed" && "$MODE" != "clear" ]]; then
  echo "Usage: tools/mock_data.sh <seed|clear>"
  exit 1
fi

if [[ "$MODE" == "seed" ]]; then
  if [[ "${ALLOW_MOCK_SEED:-false}" != "true" ]]; then
    echo "mock:seed requires explicit ALLOW_MOCK_SEED=true"
    echo "Example: ALLOW_MOCK_SEED=true tools/mock_data.sh seed"
    exit 1
  fi
  docker compose exec -T -e ALLOW_MOCK_SEED=true strapi npm run mock:seed
else
  docker compose exec -T strapi npm run mock:clear
fi
