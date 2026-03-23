#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

README_FILE="ops/log-routing/README.md"
PROD_TEMPLATE="ops/log-routing/templates/prod_log_router.template"
INGEST_TEMPLATE="ops/log-routing/templates/logvps_ingest.template"
RETENTION_DOC="docs/LOG_RETENTION.md"

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "PASS: $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "FAIL: $1"
}

assert_file_exists() {
  local file="$1"
  if [[ -f "$file" ]]; then
    pass "file exists -> ${file}"
  else
    fail "file missing -> ${file}"
  fi
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if [[ ! -f "$file" ]]; then
    fail "${message} (file missing: ${file})"
    return
  fi

  if rg -q -- "$pattern" "$file"; then
    pass "$message"
  else
    fail "$message"
  fi
}

check_required_fields() {
  local file="$1"
  local label="$2"
  local fields=(
    ts env channel level msg service request_id route_or_action status latency_ms user_ref meta
  )

  for field in "${fields[@]}"; do
    assert_contains "$file" "^[[:space:]]*-[[:space:]]*${field}[[:space:]]*$" "${label}: required field present -> ${field}"
  done
}

check_channel_enum() {
  local file="$1"
  local label="$2"
  local channels=(app security moderation audit release dr)

  for channel in "${channels[@]}"; do
    assert_contains "$file" "^[[:space:]]*-[[:space:]]*${channel}[[:space:]]*$" "${label}: allowed channel present -> ${channel}"
  done
}

echo "=============================================================="
echo "GEOVITO LOG ROUTING CONFIG SMOKE"
echo "root_dir=${ROOT_DIR}"
echo "=============================================================="

assert_file_exists "$README_FILE"
assert_file_exists "$PROD_TEMPLATE"
assert_file_exists "$INGEST_TEMPLATE"
assert_file_exists "$RETENTION_DOC"

assert_contains "$PROD_TEMPLATE" "^[[:space:]]*enabled:[[:space:]]*false[[:space:]]*$" "prod router template disabled by default"
assert_contains "$INGEST_TEMPLATE" "^[[:space:]]*enabled:[[:space:]]*false[[:space:]]*$" "logvps ingest template disabled by default"

assert_contains "$PROD_TEMPLATE" "logs/channels/\\*.jsonl" "prod router source points to contract channel jsonl"
assert_contains "$INGEST_TEMPLATE" "format:[[:space:]]*\"jsonl\"" "logvps ingest uses jsonl format"

check_required_fields "$PROD_TEMPLATE" "prod router template"
check_required_fields "$INGEST_TEMPLATE" "logvps ingest template"

check_channel_enum "$PROD_TEMPLATE" "prod router template"
check_channel_enum "$INGEST_TEMPLATE" "logvps ingest template"

assert_contains "$PROD_TEMPLATE" 'PROD_BUFFER_HOURS:-48h' "prod router local buffer retention default is 48h"
assert_contains "$INGEST_TEMPLATE" 'LOG_RETENTION_DAYS_HOT:-14d' "logvps hot retention default is 14d"
assert_contains "$INGEST_TEMPLATE" 'LOG_ARCHIVE_DAYS:-90d' "logvps archive retention default is 90d"

assert_contains "$README_FILE" "R2" "README includes R2 optional archive target"
assert_contains "$README_FILE" "HOME_PC" "README includes HOME_PC optional archive target"
assert_contains "$RETENTION_DOC" "R2" "retention doc includes R2 optional archive target"
assert_contains "$RETENTION_DOC" "HOME_PC" "retention doc includes HOME_PC optional archive target"
assert_contains "$PROD_TEMPLATE" "^[[:space:]]*r2:[[:space:]]*$" "prod router template includes r2 archive block"
assert_contains "$PROD_TEMPLATE" "^[[:space:]]*home_pc:[[:space:]]*$" "prod router template includes home_pc archive block"
assert_contains "$INGEST_TEMPLATE" "^[[:space:]]*r2:[[:space:]]*$" "logvps ingest template includes r2 archive block"
assert_contains "$INGEST_TEMPLATE" "^[[:space:]]*home_pc:[[:space:]]*$" "logvps ingest template includes home_pc archive block"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "=============================================================="
  echo "LOG ROUTING CONFIG SMOKE: FAIL (${FAIL_COUNT} fail, ${PASS_COUNT} pass)"
  echo "=============================================================="
  exit 1
fi

echo "=============================================================="
echo "LOG ROUTING CONFIG SMOKE: PASS (${PASS_COUNT} pass)"
echo "=============================================================="
