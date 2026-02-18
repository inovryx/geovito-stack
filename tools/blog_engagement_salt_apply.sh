#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
ROTATE="${ROTATE_BLOG_ENGAGEMENT_SALTS:-false}"

is_true() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]
}

generate_hex_64() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi

  if command -v docker >/dev/null 2>&1; then
    docker run --rm node:20-alpine node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
    return 0
  fi

  echo "ERROR: openssl or docker is required to generate secure random salt." >&2
  exit 1
}

read_env_value() {
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo ""
    return 0
  fi

  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return 0
  fi
  echo "${line#*=}"
}

upsert_env_key() {
  local key="$1"
  local value="$2"

  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

ensure_salt() {
  local key="$1"
  local current
  current="$(read_env_value "$key")"
  local rotate_enabled="false"
  if is_true "$ROTATE"; then
    rotate_enabled="true"
  fi

  if [[ -n "$current" && "$rotate_enabled" != "true" ]]; then
    echo "PASS: ${key} already set (kept)"
    return 0
  fi

  local salt
  salt="$(generate_hex_64)"
  upsert_env_key "$key" "$salt"
  echo "PASS: ${key} updated (${salt:0:8}...)"
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found: $ENV_FILE"
  echo "Hint: copy from .env.example and then rerun."
  exit 1
fi

echo "=============================================================="
echo "GEOVITO BLOG ENGAGEMENT SALT APPLY"
echo "ENV_FILE=$ENV_FILE"
echo "ROTATE_BLOG_ENGAGEMENT_SALTS=$ROTATE"
echo "=============================================================="

ensure_salt "BLOG_COMMENT_IP_HASH_SALT"
ensure_salt "BLOG_LIKE_IP_HASH_SALT"

echo "=============================================================="
echo "PASS: blog engagement salts ensured in env file."
echo "Next:"
echo "  docker compose up -d --force-recreate strapi"
echo "  bash tools/blog_engagement_policy_check.sh"
echo "=============================================================="
