#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FAIL_COUNT=0

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

read_runtime_env() {
  local key="$1"
  docker compose exec -T strapi printenv "$key" 2>/dev/null | tr -d '\r' | tail -n 1
}

normalize_bool() {
  local raw="${1:-}"
  local fallback="${2:-false}"
  local normalized
  normalized="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  case "$normalized" in
    1|true|yes|on) echo "true" ;;
    0|false|no|off) echo "false" ;;
    "") echo "$fallback" ;;
    *) echo "$fallback" ;;
  esac
}

echo "=============================================================="
echo "GEOVITO MEDIA POLICY CHECK"
echo "=============================================================="

docker compose up -d strapi >/dev/null

convert_enabled="$(normalize_bool "$(read_runtime_env MEDIA_IMAGE_CONVERT_ENABLED)" "true")"
target_format="$(printf '%s' "$(read_runtime_env MEDIA_IMAGE_TARGET_FORMAT)" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
target_format="${target_format:-webp}"
allowed_input_raw="$(printf '%s' "$(read_runtime_env MEDIA_IMAGE_ALLOWED_INPUT_MIME)" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
allowed_input_raw="${allowed_input_raw:-jpg,jpeg,png,webp}"

has_allowed_format() {
  local list="$1"
  local format="$2"
  local joined=",$list,"
  case "$format" in
    jpg|jpeg)
      [[ "$joined" == *",jpg,"* || "$joined" == *",jpeg,"* || "$joined" == *",image/jpg,"* || "$joined" == *",image/jpeg,"* ]]
      ;;
    png)
      [[ "$joined" == *",png,"* || "$joined" == *",image/png,"* ]]
      ;;
    webp)
      [[ "$joined" == *",webp,"* || "$joined" == *",image/webp,"* ]]
      ;;
    *)
      return 1
      ;;
  esac
}

echo "Runtime:"
echo "  MEDIA_IMAGE_CONVERT_ENABLED=${convert_enabled}"
echo "  MEDIA_IMAGE_TARGET_FORMAT=${target_format}"
echo "  MEDIA_IMAGE_ALLOWED_INPUT_MIME=${allowed_input_raw}"

if [[ "$convert_enabled" != "true" ]]; then
  fail "image conversion should remain enabled for webp-first policy"
else
  pass "image conversion enabled"
fi

if [[ "$target_format" != "webp" ]]; then
  fail "MEDIA_IMAGE_TARGET_FORMAT must be webp (current=${target_format})"
else
  pass "target format is webp"
fi

for required_format in jpg jpeg png webp; do
  if has_allowed_format "$allowed_input_raw" "$required_format"; then
    pass "allowed input includes ${required_format}"
  else
    fail "MEDIA_IMAGE_ALLOWED_INPUT_MIME must include ${required_format}"
  fi
done

if [[ -f "${ROOT_DIR}/frontend/public/og-default.jpg" ]]; then
  pass "default OG JPEG exists (frontend/public/og-default.jpg)"
else
  fail "default OG JPEG missing (frontend/public/og-default.jpg)"
fi

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "=============================================================="
  echo "MEDIA POLICY CHECK: FAIL (${FAIL_COUNT} issue)"
  echo "=============================================================="
  exit 1
fi

echo "=============================================================="
echo "MEDIA POLICY CHECK: PASS"
echo "=============================================================="
exit 0
