#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_DIR="${LAUNCH_PROFILE_DIR:-$ROOT_DIR/templates}"

IDENTITY_FILE="${LAUNCH_IDENTITY_FILE:-$PROFILE_DIR/project.identity.json}"
LOCAL_ENV_FILE="${LAUNCH_LOCAL_ENV_FILE:-$PROFILE_DIR/project.local.env}"
LAUNCH_ENV_FILE="${LAUNCH_LAUNCH_ENV_FILE:-$PROFILE_DIR/project.launch.env}"

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "PASS: $1"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  echo "WARN: $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "FAIL: $1"
}

require_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    pass "file exists -> ${file}"
  else
    fail "file missing -> ${file}"
  fi
}

extract_env_value() {
  local file="$1"
  local key="$2"
  local line value
  line="$(rg -m1 "^${key}=" "$file" 2>/dev/null || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return 0
  fi
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi
  echo "$value"
}

require_key_present() {
  local file="$1"
  local key="$2"
  if rg -q "^${key}=" "$file" 2>/dev/null; then
    pass "key present -> ${key}"
  else
    fail "missing key -> ${key} (${file})"
  fi
}

require_non_empty() {
  local file="$1"
  local key="$2"
  local value
  value="$(extract_env_value "$file" "$key")"
  if [[ -n "$value" ]]; then
    pass "non-empty value -> ${key}"
  else
    fail "empty value -> ${key} (${file})"
  fi
}

validate_domain_key() {
  local file="$1"
  local key="$2"
  local value
  value="$(extract_env_value "$file" "$key")"

  if [[ -z "$value" ]]; then
    fail "domain empty -> ${key}"
    return
  fi

  if [[ "$value" == *"://"* || "$value" == */* ]]; then
    fail "domain must be hostname-only -> ${key}=${value}"
    return
  fi

  if [[ "$value" =~ ^[A-Za-z0-9.-]+$ ]] && [[ "$value" == *.* ]]; then
    pass "domain format ok -> ${key}=${value}"
  else
    fail "invalid domain format -> ${key}=${value}"
  fi
}

validate_optional_domain_key() {
  local file="$1"
  local key="$2"
  local value
  value="$(extract_env_value "$file" "$key")"

  if [[ -z "$value" ]]; then
    pass "optional domain empty -> ${key}"
    return
  fi

  if [[ "$value" == *"://"* || "$value" == */* ]]; then
    fail "optional domain must be hostname-only -> ${key}=${value}"
    return
  fi

  if [[ "$value" =~ ^[A-Za-z0-9.-]+$ ]] && [[ "$value" == *.* ]]; then
    pass "optional domain format ok -> ${key}=${value}"
  else
    fail "invalid optional domain format -> ${key}=${value}"
  fi
}

validate_enum_key() {
  local file="$1"
  local key="$2"
  local allowed_csv="$3"
  local value
  value="$(extract_env_value "$file" "$key")"

  if [[ -z "$value" ]]; then
    fail "enum value empty -> ${key}"
    return
  fi

  local found="false"
  IFS=',' read -r -a allowed_arr <<< "$allowed_csv"
  local item
  for item in "${allowed_arr[@]}"; do
    if [[ "$value" == "$item" ]]; then
      found="true"
      break
    fi
  done

  if [[ "$found" == "true" ]]; then
    pass "enum value valid -> ${key}=${value}"
  else
    fail "invalid enum value -> ${key}=${value} (allowed: ${allowed_csv})"
  fi
}

validate_bool_key() {
  local file="$1"
  local key="$2"
  local value
  value="$(extract_env_value "$file" "$key")"

  case "$value" in
    true|false|1|0)
      pass "boolean value valid -> ${key}=${value}"
      ;;
    *)
      fail "invalid boolean -> ${key}=${value}"
      ;;
  esac
}

validate_secret_placeholder() {
  local file="$1"
  local key="$2"
  local value
  value="$(extract_env_value "$file" "$key")"

  if [[ -z "$value" ]]; then
    pass "secret key blank/placeholder acceptable -> ${key}"
    return
  fi

  if [[ "$value" =~ ^REPLACE_WITH_ ]]; then
    pass "secret key placeholder ok -> ${key}"
  else
    fail "secret key appears non-placeholder -> ${key} (do not commit real secret values)"
  fi
}

validate_analytics_placeholder() {
  local file="$1"
  local key="$2"
  local value
  value="$(extract_env_value "$file" "$key")"

  if [[ -z "$value" ]]; then
    pass "analytics id optional/empty -> ${key}"
    return
  fi

  if [[ "$value" =~ ^REPLACE_WITH_ ]]; then
    pass "analytics id placeholder ok -> ${key}"
    return
  fi

  warn "analytics id has concrete value -> ${key}=${value}"
}

validate_identity_json() {
  local file="$1"

  python3 - "$file" <<'PY'
import json
import re
import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

required = ["site_name", "brand_basics", "project_type", "project_slug", "canonical_locale", "notes"]
for key in required:
    if key not in data:
        raise SystemExit(f"missing key: {key}")

if not isinstance(data["brand_basics"], dict):
    raise SystemExit("brand_basics must be object")

for key in ["primary_color", "secondary_color", "tone", "tagline", "logo_placeholder"]:
    if key not in data["brand_basics"]:
        raise SystemExit(f"brand_basics missing key: {key}")

allowed_types = {"travel-community", "pet-community", "content-site", "saas-admin", "other"}
if data["project_type"] not in allowed_types:
    raise SystemExit(f"invalid project_type: {data['project_type']}")

locale = str(data["canonical_locale"])
if not re.match(r"^[a-z]{2}(-[a-z]{2})?$", locale):
    raise SystemExit(f"invalid canonical_locale: {locale}")

slug = str(data["project_slug"])
if not re.match(r"^[a-z0-9-]+$", slug):
    raise SystemExit(f"invalid project_slug: {slug}")

print("OK")
PY
}

echo "=============================================================="
echo "GEOVITO LAUNCH PROFILE VALIDATE"
echo "profile_dir=${PROFILE_DIR}"
echo "identity_file=${IDENTITY_FILE}"
echo "local_env_file=${LOCAL_ENV_FILE}"
echo "launch_env_file=${LAUNCH_ENV_FILE}"
echo "=============================================================="

require_file "$IDENTITY_FILE"
require_file "$LOCAL_ENV_FILE"
require_file "$LAUNCH_ENV_FILE"

if validate_identity_json "$IDENTITY_FILE" >/tmp/launch-profile-identity-check.log 2>&1; then
  pass "identity json schema valid"
else
  cat /tmp/launch-profile-identity-check.log >&2 || true
  fail "identity json schema invalid"
fi
rm -f /tmp/launch-profile-identity-check.log

LOCAL_REQUIRED_KEYS=(
  PROJECT_SLUG
  PROJECT_SITE_NAME
  PROJECT_TYPE
  LOCAL_APP_BASE_URL
  LOCAL_CMS_BASE_URL
  LOCAL_CANONICAL_LOCALE
  LOCAL_SMTP_MODE
  LOCAL_STORAGE_MODE
  LOCAL_DEBUG
  LOCAL_ANALYTICS_ENABLED
  LOCAL_ANALYTICS_PROVIDER
)

LAUNCH_REQUIRED_KEYS=(
  PROJECT_SLUG
  PROJECT_SITE_NAME
  PROJECT_TYPE
  LAUNCH_CANONICAL_LOCALE
  LAUNCH_PROD_APP_DOMAIN
  LAUNCH_PROD_CMS_DOMAIN
  LAUNCH_STAGING_APP_DOMAIN
  LAUNCH_STAGING_CMS_DOMAIN
  LAUNCH_CLOUDFLARE_ZONE_NAME
  LAUNCH_CLOUDFLARE_ZONE_ID
  LAUNCH_CLOUDFLARE_ACCOUNT_ID
  LAUNCH_SMTP_MODE
  LAUNCH_SMTP_BLOCK_REAL
  LAUNCH_STORAGE_PRIMARY
  LAUNCH_STORAGE_BACKUP
  LAUNCH_STORAGE_BUCKET
  LAUNCH_STORAGE_PREFIX
  LAUNCH_ANALYTICS_PROVIDER
)

for key in "${LOCAL_REQUIRED_KEYS[@]}"; do
  require_key_present "$LOCAL_ENV_FILE" "$key"
  require_non_empty "$LOCAL_ENV_FILE" "$key"
done

for key in "${LAUNCH_REQUIRED_KEYS[@]}"; do
  require_key_present "$LAUNCH_ENV_FILE" "$key"
  require_non_empty "$LAUNCH_ENV_FILE" "$key"
done

validate_enum_key "$LOCAL_ENV_FILE" "PROJECT_TYPE" "travel-community,pet-community,content-site,saas-admin,other"
validate_enum_key "$LOCAL_ENV_FILE" "LOCAL_SMTP_MODE" "console,mailsink,sendmail,nodemailer"
validate_enum_key "$LOCAL_ENV_FILE" "LOCAL_STORAGE_MODE" "local,r2,s3,gcs,mixed"
validate_bool_key "$LOCAL_ENV_FILE" "LOCAL_DEBUG"
validate_bool_key "$LOCAL_ENV_FILE" "LOCAL_ANALYTICS_ENABLED"

validate_enum_key "$LAUNCH_ENV_FILE" "PROJECT_TYPE" "travel-community,pet-community,content-site,saas-admin,other"
validate_enum_key "$LAUNCH_ENV_FILE" "LAUNCH_SMTP_MODE" "sendmail,nodemailer,mailsink"
validate_bool_key "$LAUNCH_ENV_FILE" "LAUNCH_SMTP_BLOCK_REAL"
validate_enum_key "$LAUNCH_ENV_FILE" "LAUNCH_STORAGE_PRIMARY" "local,r2,s3,gcs,mixed"
validate_enum_key "$LAUNCH_ENV_FILE" "LAUNCH_STORAGE_BACKUP" "local,r2,s3,gcs,mixed"
validate_enum_key "$LAUNCH_ENV_FILE" "LAUNCH_ANALYTICS_PROVIDER" "none,ga4,gtm,dataLayer,custom"

validate_domain_key "$LAUNCH_ENV_FILE" "LAUNCH_PROD_APP_DOMAIN"
validate_domain_key "$LAUNCH_ENV_FILE" "LAUNCH_PROD_CMS_DOMAIN"
validate_domain_key "$LAUNCH_ENV_FILE" "LAUNCH_STAGING_APP_DOMAIN"
validate_domain_key "$LAUNCH_ENV_FILE" "LAUNCH_STAGING_CMS_DOMAIN"
validate_optional_domain_key "$LAUNCH_ENV_FILE" "LAUNCH_OPTIONAL_WWW_DOMAIN"

SECRET_KEYS=(
  LOCAL_DB_PASSWORD
  LOCAL_API_TOKEN
  LAUNCH_CLOUDFLARE_API_TOKEN
  LAUNCH_SMTP_USER
  LAUNCH_SMTP_PASS
  LAUNCH_SENTRY_DSN
)

for key in "${SECRET_KEYS[@]}"; do
  if rg -q "^${key}=" "$LOCAL_ENV_FILE" 2>/dev/null || rg -q "^${key}=" "$LAUNCH_ENV_FILE" 2>/dev/null; then
    if rg -q "^${key}=" "$LOCAL_ENV_FILE" 2>/dev/null; then
      validate_secret_placeholder "$LOCAL_ENV_FILE" "$key"
    else
      validate_secret_placeholder "$LAUNCH_ENV_FILE" "$key"
    fi
  else
    warn "secret key not declared in templates -> ${key}"
  fi
done

ANALYTICS_ID_KEYS=(
  LAUNCH_ANALYTICS_GA4_ID
  LAUNCH_ANALYTICS_GTM_ID
)

for key in "${ANALYTICS_ID_KEYS[@]}"; do
  require_key_present "$LAUNCH_ENV_FILE" "$key"
  validate_analytics_placeholder "$LAUNCH_ENV_FILE" "$key"
done

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "=============================================================="
  echo "LAUNCH PROFILE VALIDATE: FAIL (${FAIL_COUNT} fail, ${WARN_COUNT} warn, ${PASS_COUNT} pass)"
  echo "=============================================================="
  exit 1
fi

echo "=============================================================="
echo "LAUNCH PROFILE VALIDATE: PASS (${WARN_COUNT} warn, ${PASS_COUNT} pass)"
echo "=============================================================="
