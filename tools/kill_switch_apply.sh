#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

INCIDENT_ID="${INCIDENT_ID:-}"
APPROVER_EMAIL="${APPROVER_EMAIL:-}"
REASON="${REASON:-}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

ensure_script_runtime() {
  local script_name="community_kill_switch_apply.js"
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

[[ -n "$INCIDENT_ID" ]] || fail "INCIDENT_ID is required"
[[ -n "$APPROVER_EMAIL" ]] || fail "APPROVER_EMAIL is required"
[[ -n "$REASON" ]] || fail "REASON is required"

ensure_script_runtime

output="$(docker compose exec -T -e INCIDENT_ID="$INCIDENT_ID" -e OPERATOR_EMAIL="$APPROVER_EMAIL" -e REASON="$REASON" strapi node scripts/community_kill_switch_apply.js)"
json_line="$(printf '%s\n' "$output" | sed -n 's/^JSON_OUTPUT://p' | tail -n 1)"
[[ -n "$json_line" ]] || fail "kill switch apply did not return JSON output"

snapshot_file="artifacts/emergency/kill-switch-${INCIDENT_ID}.json"
mkdir -p "$(dirname "$snapshot_file")"
printf '%s\n' "$json_line" > "$snapshot_file"

pass "kill switch applied"
pass "snapshot written -> ${snapshot_file}"
echo "Next: INCIDENT_ID=${INCIDENT_ID} APPROVER_EMAIL=${APPROVER_EMAIL} REASON='all clear' bash tools/kill_switch_clear.sh"
