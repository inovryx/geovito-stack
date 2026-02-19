#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SMOKE_ACCESS_ENV_FILE="${SMOKE_ACCESS_ENV_FILE:-$HOME/.config/geovito/smoke_access.env}"
if [[ -f "$SMOKE_ACCESS_ENV_FILE" && ( -z "${CF_ACCESS_CLIENT_ID:-}" || -z "${CF_ACCESS_CLIENT_SECRET:-}" ) ]]; then
  # shellcheck disable=SC1090
  source "$SMOKE_ACCESS_ENV_FILE"
fi

if [[ -z "${CF_ACCESS_CLIENT_ID:-}" || -z "${CF_ACCESS_CLIENT_SECRET:-}" ]]; then
  cat <<EOF
FAIL: CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET eksik.

Once bir kez su dosyayi hazirla:
  bash tools/smoke_access_env_init.sh
  nano "$SMOKE_ACCESS_ENV_FILE"
  chmod 600 "$SMOKE_ACCESS_ENV_FILE"

Alternatif: sadece bu komut icin env ver:
  CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... bash tools/smoke_access.sh
EOF
  exit 1
fi

if [[ "${CF_ACCESS_CLIENT_ID}" == *"REPLACE_WITH_"* || "${CF_ACCESS_CLIENT_SECRET}" == *"REPLACE_WITH_"* ]]; then
  cat <<EOF
FAIL: smoke access token dosyasi placeholder iceriyor.
Dosyayi guncelle:
  nano "$SMOKE_ACCESS_ENV_FILE"
EOF
  exit 1
fi

BASE_URL="${BASE_URL:-https://geovito.com}"
BASE_URL="${BASE_URL%/}"
EXPECTED_SHA7="${EXPECTED_SHA7:-$(git rev-parse --short=7 HEAD)}"
SMOKE_RUN_BLOG_MODERATION_REPORT="${SMOKE_RUN_BLOG_MODERATION_REPORT:-false}"
SMOKE_BLOG_MODERATION_ARGS="${SMOKE_BLOG_MODERATION_ARGS:---fail-on-stale-pending}"

echo "=============================================================="
echo "GEOVITO ACCESS SMOKE WRAPPER"
echo "BASE_URL=${BASE_URL}"
echo "EXPECTED_SHA7=${EXPECTED_SHA7}"
echo "SMOKE_ACCESS_ENV_FILE=${SMOKE_ACCESS_ENV_FILE}"
echo "=============================================================="

CF_ACCESS_CLIENT_ID="$CF_ACCESS_CLIENT_ID" \
CF_ACCESS_CLIENT_SECRET="$CF_ACCESS_CLIENT_SECRET" \
BASE_URL="$BASE_URL" \
EXPECTED_SHA7="$EXPECTED_SHA7" \
bash tools/post_deploy_smoke.sh

if [[ "$SMOKE_RUN_BLOG_MODERATION_REPORT" == "true" ]]; then
  echo "=============================================================="
  echo "GEOVITO ACCESS SMOKE: moderation queue check enabled"
  echo "SMOKE_BLOG_MODERATION_ARGS=${SMOKE_BLOG_MODERATION_ARGS}"
  echo "=============================================================="
  # shellcheck disable=SC2086
  bash tools/blog_moderation_report.sh $SMOKE_BLOG_MODERATION_ARGS
fi
