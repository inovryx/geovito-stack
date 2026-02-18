#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
TURNSTILE_ENV_FILE="${TURNSTILE_ENV_FILE:-$HOME/.config/geovito/turnstile.env}"
MODE="${1:-enable}"

upsert_env_key() {
  local key="$1"
  local value="$2"

  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

is_placeholder() {
  local value="$1"
  [[ -z "$value" || "$value" == REPLACE_WITH_REAL_* ]]
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found: $ENV_FILE"
  exit 1
fi

case "$MODE" in
  enable)
    if [[ ! -f "$TURNSTILE_ENV_FILE" ]]; then
      echo "INFO: Turnstile secret file bulunamadi."
      bash "$ROOT_DIR/tools/turnstile_env_init.sh"
      echo "ERROR: once key degerlerini girip tekrar calistirin."
      exit 1
    fi

    # shellcheck disable=SC1090
    source "$TURNSTILE_ENV_FILE"

    site_key="${PUBLIC_TURNSTILE_SITE_KEY:-}"
    secret_key="${TURNSTILE_SECRET_KEY:-}"

    if is_placeholder "$site_key"; then
      echo "ERROR: PUBLIC_TURNSTILE_SITE_KEY gecersiz. Dosya: $TURNSTILE_ENV_FILE"
      exit 1
    fi
    if is_placeholder "$secret_key"; then
      echo "ERROR: TURNSTILE_SECRET_KEY gecersiz. Dosya: $TURNSTILE_ENV_FILE"
      exit 1
    fi

    upsert_env_key "PUBLIC_TURNSTILE_SITE_KEY" "$site_key"
    upsert_env_key "TURNSTILE_SECRET_KEY" "$secret_key"
    upsert_env_key "TURNSTILE_ENABLED" "true"
    upsert_env_key "BLOG_COMMENT_GUEST_TURNSTILE_REQUIRED" "true"

    echo "PASS: guest comment turnstile ENABLED in $ENV_FILE"
    ;;
  disable)
    upsert_env_key "TURNSTILE_ENABLED" "false"
    upsert_env_key "BLOG_COMMENT_GUEST_TURNSTILE_REQUIRED" "false"
    echo "PASS: guest comment turnstile DISABLED in $ENV_FILE"
    ;;
  *)
    echo "Usage: bash tools/turnstile_guest_comments.sh [enable|disable]"
    exit 1
    ;;
esac

cd "$ROOT_DIR"
docker compose up -d --force-recreate strapi >/dev/null
echo "PASS: strapi recreated"

echo "Next checks:"
echo "  bash tools/blog_engagement_policy_check.sh"
echo "  bash tools/blog_engagement_smoke.sh"
echo "  bash tools/auth_flow_check.sh"
