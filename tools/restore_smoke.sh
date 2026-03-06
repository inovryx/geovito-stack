#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${RESTORE_SMOKE_API_BASE:-${API_BASE:-http://127.0.0.1:1337}}"
BASE_URL="${RESTORE_SMOKE_BASE_URL:-${BASE_URL:-}}"
BACKUP_STAMP="${BACKUP_STAMP:-}"
RESTORE_TARGET="${RESTORE_TARGET:-staging}"
WITH_ACCESS_SMOKE="${RESTORE_SMOKE_WITH_ACCESS:-false}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

API_BASE="$API_BASE" bash tools/stack_health.sh >/dev/null
pass "stack health check"

API_BASE="$API_BASE" bash tools/prod_health.sh >/dev/null
pass "production health smoke"

API_BASE="$API_BASE" bash tools/community_settings_smoke.sh >/dev/null
pass "community settings smoke"

API_BASE="$API_BASE" bash tools/report_moderation_smoke.sh >/dev/null
pass "report moderation smoke"

if [[ "$WITH_ACCESS_SMOKE" == "true" ]]; then
  [[ -n "$BASE_URL" ]] || fail "RESTORE_SMOKE_BASE_URL is required when RESTORE_SMOKE_WITH_ACCESS=true"
  BASE_URL="$BASE_URL" EXPECTED_SHA7="$(git rev-parse --short=7 HEAD)" bash tools/smoke_access.sh >/dev/null
  pass "access smoke"
fi

mkdir -p artifacts/dr
cat > artifacts/dr/restore-smoke-last.json <<JSON
{
  "status": "pass",
  "restore_target": "${RESTORE_TARGET}",
  "backup_stamp": "${BACKUP_STAMP}",
  "smoke_at_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "git_sha7": "$(git rev-parse --short=7 HEAD)"
}
JSON

echo "RESTORE SMOKE: PASS"
