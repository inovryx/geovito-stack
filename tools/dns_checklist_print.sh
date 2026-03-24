#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_DIR="${LAUNCH_PROFILE_DIR:-$ROOT_DIR/templates}"
LAUNCH_ENV_FILE="${LAUNCH_LAUNCH_ENV_FILE:-$PROFILE_DIR/project.launch.env}"

extract_env_value() {
  local file="$1"
  local key="$2"
  local line value
  line="$(rg -m1 "^${key}=" "$file" 2>/dev/null || true)"
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi
  echo "$value"
}

[[ -f "$LAUNCH_ENV_FILE" ]] || {
  echo "FAIL: launch profile not found -> ${LAUNCH_ENV_FILE}"
  exit 1
}

PROJECT_SLUG="$(extract_env_value "$LAUNCH_ENV_FILE" "PROJECT_SLUG")"
ZONE_NAME="$(extract_env_value "$LAUNCH_ENV_FILE" "LAUNCH_CLOUDFLARE_ZONE_NAME")"
PROD_APP_DOMAIN="$(extract_env_value "$LAUNCH_ENV_FILE" "LAUNCH_PROD_APP_DOMAIN")"
PROD_CMS_DOMAIN="$(extract_env_value "$LAUNCH_ENV_FILE" "LAUNCH_PROD_CMS_DOMAIN")"
STAGING_APP_DOMAIN="$(extract_env_value "$LAUNCH_ENV_FILE" "LAUNCH_STAGING_APP_DOMAIN")"
STAGING_CMS_DOMAIN="$(extract_env_value "$LAUNCH_ENV_FILE" "LAUNCH_STAGING_CMS_DOMAIN")"
OPTIONAL_WWW_DOMAIN="$(extract_env_value "$LAUNCH_ENV_FILE" "LAUNCH_OPTIONAL_WWW_DOMAIN")"

echo "=============================================================="
echo "GEOVITO DNS CHECKLIST PRINT"
echo "profile=${LAUNCH_ENV_FILE}"
echo "project_slug=${PROJECT_SLUG:-<empty>}"
echo "cloudflare_zone=${ZONE_NAME:-<empty>}"
echo "=============================================================="

echo "[ ] Verify Cloudflare zone exists and is selected"
echo "    - zone: ${ZONE_NAME:-<empty>}"

echo "[ ] Prod app domain DNS record"
echo "    - host: ${PROD_APP_DOMAIN:-<empty>}"
echo "    - recommended: CNAME (Pages/custom host) or A/AAAA by deployment model"

echo "[ ] Prod CMS domain DNS record"
echo "    - host: ${PROD_CMS_DOMAIN:-<empty>}"
echo "    - recommended: A/AAAA to CMS origin (proxied as required)"

echo "[ ] Staging app domain DNS record"
echo "    - host: ${STAGING_APP_DOMAIN:-<empty>}"
echo "    - recommended: CNAME to staging frontend target"

echo "[ ] Staging CMS domain DNS record"
echo "    - host: ${STAGING_CMS_DOMAIN:-<empty>}"
echo "    - recommended: A/AAAA to staging CMS origin"

if [[ -n "$OPTIONAL_WWW_DOMAIN" ]]; then
  echo "[ ] Optional WWW domain DNS record"
  echo "    - host: ${OPTIONAL_WWW_DOMAIN}"
  echo "    - recommended: CNAME to canonical app host"
else
  echo "[ ] Optional WWW domain DNS record (skipped: LAUNCH_OPTIONAL_WWW_DOMAIN empty)"
fi

echo "[ ] SSL/TLS mode verified for all hosts (Full/Strict recommended)"
echo "[ ] Proxy policy verified (proxied vs DNS-only) per service"
echo "[ ] Health checks run after DNS propagation"
echo "    - bash tools/staging_health.sh"
echo "    - bash tools/staging_isolation_check.sh"

echo "INFO: checklist generation only; no DNS mutation was performed."
echo "DNS CHECKLIST: READY"
