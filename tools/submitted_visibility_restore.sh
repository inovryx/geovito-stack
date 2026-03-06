#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

INCIDENT_ID="${INCIDENT_ID:-}"
APPROVER_EMAIL="${APPROVER_EMAIL:-}"
REASON="${REASON:-}"
SNAPSHOT_FILE="${SNAPSHOT_FILE:-}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

ensure_script_runtime() {
  local script_name="submitted_visibility_restore.js"
  docker compose up -d strapi >/dev/null
  local host_hash container_hash
  host_hash="$(sha256sum "${ROOT_DIR}/app/scripts/${script_name}" | cut -d ' ' -f1)"
  container_hash="$(docker compose exec -T strapi sh -lc "sha256sum scripts/${script_name} | cut -d ' ' -f1" 2>/dev/null || true)"
  if [[ -n "$host_hash" && -n "$container_hash" && "$host_hash" == "$container_hash" ]]; then
    return 0
  fi
  echo "INFO: Strapi container script guncel degil, rebuild yapiliyor..."
  docker compose up -d --build strapi >/dev/null
}

run_restore() {
  docker compose exec -T -e INCIDENT_ID="$INCIDENT_ID" -e APPROVER_EMAIL="$APPROVER_EMAIL" -e REASON="$REASON" -e SUBMITTED_VISIBILITY_SNAPSHOT_JSON="$snapshot_json" strapi node scripts/submitted_visibility_restore.js
}

[[ -n "$INCIDENT_ID" ]] || fail "INCIDENT_ID is required"
[[ -n "$APPROVER_EMAIL" ]] || fail "APPROVER_EMAIL is required"
[[ -n "$REASON" ]] || fail "REASON is required"

if [[ -z "$SNAPSHOT_FILE" ]]; then
  SNAPSHOT_FILE="artifacts/emergency/submitted-visibility-${INCIDENT_ID}.json"
fi
[[ -f "$SNAPSHOT_FILE" ]] || fail "snapshot file not found: $SNAPSHOT_FILE"

snapshot_json="$(cat "$SNAPSHOT_FILE")"

ensure_script_runtime
set +e
output="$(run_restore 2>&1)"
code=$?
set -e

if [[ $code -ne 0 && "$output" == *"KnexTimeoutError"* ]]; then
  echo "WARN: transient DB pool timeout during submitted restore, retrying once..."
  docker compose restart strapi >/dev/null
  sleep 2
  output="$(run_restore)"
  code=$?
fi

if [[ $code -ne 0 ]]; then
  printf '%s\n' "$output"
  fail "submitted visibility restore command failed"
fi

json_line="$(printf '%s\n' "$output" | sed -n 's/^JSON_OUTPUT://p' | tail -n 1)"
[[ -n "$json_line" ]] || fail "submitted visibility restore did not return JSON output"

pass "submitted visibility restored"
echo "JSON_OUTPUT:${json_line}"
