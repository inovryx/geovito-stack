#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MEDIA_SMOKE_ENV_FILE="${MEDIA_SMOKE_ENV_FILE:-$HOME/.config/geovito/media_smoke.env}"

if [[ ! -f "$MEDIA_SMOKE_ENV_FILE" ]]; then
  echo "INFO: media smoke secret file bulunamadi."
  bash tools/media_smoke_env_init.sh
  echo "ERROR: once token girip tekrar calistirin."
  exit 1
fi

# shellcheck disable=SC1090
source "$MEDIA_SMOKE_ENV_FILE"

if [[ -z "${STRAPI_API_TOKEN:-}" || "${STRAPI_API_TOKEN:-}" == "REPLACE_WITH_REAL_STRAPI_API_TOKEN" ]]; then
  echo "ERROR: STRAPI_API_TOKEN bos/gecersiz. Dosya: $MEDIA_SMOKE_ENV_FILE"
  exit 1
fi

bash tools/media_upload_smoke.sh
