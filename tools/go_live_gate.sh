#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EXPECTED_SHA7="${EXPECTED_SHA7:-$(git rev-parse --short=7 HEAD)}"
CREATOR_USERNAME="${CREATOR_USERNAME:-}"
SMOKE_ACCESS_ENV_FILE="${SMOKE_ACCESS_ENV_FILE:-$HOME/.config/geovito/smoke_access.env}"
HEALTH_TOKEN="${HEALTH_TOKEN:-}"
HEALTH_ENV_FILE="${HEALTH_ENV_FILE:-$HOME/.config/geovito/health.env}"

GO_LIVE_WITH_DEPLOY="${GO_LIVE_WITH_DEPLOY:-true}"
GO_LIVE_WITH_SMTP="${GO_LIVE_WITH_SMTP:-false}"
GO_LIVE_WITH_BACKUP_VERIFY="${GO_LIVE_WITH_BACKUP_VERIFY:-false}"
GO_LIVE_WITH_UGC_SHOWCASE_MOD="${GO_LIVE_WITH_UGC_SHOWCASE_MOD:-false}"
GO_LIVE_UGC_SHOWCASE_OWNER_EMAIL="${GO_LIVE_UGC_SHOWCASE_OWNER_EMAIL:-${SHOWCASE_OWNER_EMAIL:-}}"
GO_LIVE_UGC_SHOWCASE_RESTORE_TO_SUBMITTED="${GO_LIVE_UGC_SHOWCASE_RESTORE_TO_SUBMITTED:-true}"
GO_LIVE_REQUIRE_CREATOR="${GO_LIVE_REQUIRE_CREATOR:-false}"
GO_LIVE_SKIP_PRE_IMPORT="${GO_LIVE_SKIP_PRE_IMPORT:-false}"
GO_LIVE_SKIP_PRE_DESIGN="${GO_LIVE_SKIP_PRE_DESIGN:-false}"
GO_LIVE_SKIP_UI="${GO_LIVE_SKIP_UI:-false}"
GO_LIVE_SKIP_REPORT_SMOKE="${GO_LIVE_SKIP_REPORT_SMOKE:-false}"
GO_LIVE_SKIP_COMMUNITY_SETTINGS_SMOKE="${GO_LIVE_SKIP_COMMUNITY_SETTINGS_SMOKE:-false}"
GO_LIVE_SKIP_UGC_API_CONTRACT="${GO_LIVE_SKIP_UGC_API_CONTRACT:-false}"
GO_LIVE_SKIP_UI_PAGE_PROGRESS="${GO_LIVE_SKIP_UI_PAGE_PROGRESS:-false}"
GO_LIVE_SKIP_DASHBOARD_ROLE_SMOKE="${GO_LIVE_SKIP_DASHBOARD_ROLE_SMOKE:-false}"
GO_LIVE_SKIP_FOLLOW_SMOKE="${GO_LIVE_SKIP_FOLLOW_SMOKE:-false}"
GO_LIVE_SKIP_NOTIFICATION_SMOKE="${GO_LIVE_SKIP_NOTIFICATION_SMOKE:-false}"
GO_LIVE_SKIP_SAVED_LIST_SMOKE="${GO_LIVE_SKIP_SAVED_LIST_SMOKE:-false}"

RESET_SMOKE_EMAIL="${RESET_SMOKE_EMAIL:-${EMAIL_SMOKE_TO:-}}"

declare -a STEP_NAMES=()
declare -a STEP_STATUS=()
declare -a STEP_CODES=()

usage() {
  cat <<'USAGE'
Usage:
  bash tools/go_live_gate.sh

Purpose:
  Run go-live PASS/FAIL checks in one command with summary output.

Env toggles:
  EXPECTED_SHA7=<git_short_sha>   # defaults to current HEAD
  CREATOR_USERNAME=<username>     # optional; enables creator smoke checks
  HEALTH_TOKEN=<token>            # optional; used by stack_health when /api/_health is protected
  HEALTH_ENV_FILE=~/.config/geovito/health.env
  GO_LIVE_REQUIRE_CREATOR=true    # fail if creator username missing
  GO_LIVE_WITH_DEPLOY=true|false  # run pages_deploy_force before smoke (default: true)
  GO_LIVE_WITH_BACKUP_VERIFY=true # verify latest backup snapshot integrity
  GO_LIVE_WITH_UGC_SHOWCASE_MOD=true  # run seeded UGC moderation round-trip check
  GO_LIVE_UGC_SHOWCASE_OWNER_EMAIL=<mail>  # optional owner for showcase moderation check
  GO_LIVE_UGC_SHOWCASE_RESTORE_TO_SUBMITTED=true|false  # restore target post after check
  GO_LIVE_SKIP_PRE_IMPORT=true    # skip pre_import_index_gate_check
  GO_LIVE_SKIP_PRE_DESIGN=true    # skip pre_design_gate_check
  GO_LIVE_SKIP_UI=true            # skip account/dashboard playwright checks
  GO_LIVE_SKIP_REPORT_SMOKE=true  # skip content report submission/moderation smoke
  GO_LIVE_SKIP_COMMUNITY_SETTINGS_SMOKE=true  # skip community settings role/contract smoke
  GO_LIVE_SKIP_UGC_API_CONTRACT=true  # skip UGC API contract check
  GO_LIVE_SKIP_UI_PAGE_PROGRESS=true  # skip ui-page translation progress contract check
  GO_LIVE_SKIP_DASHBOARD_ROLE_SMOKE=true  # skip dashboard role baseline smoke
  GO_LIVE_SKIP_FOLLOW_SMOKE=true  # skip follow system foundation smoke
  GO_LIVE_SKIP_NOTIFICATION_SMOKE=true  # skip notification preferences smoke
  GO_LIVE_SKIP_SAVED_LIST_SMOKE=true  # skip saved list foundation smoke
  GO_LIVE_WITH_SMTP=true          # run password reset smoke (requires RESET_SMOKE_EMAIL)
  RESET_SMOKE_EMAIL=<mail>        # required when GO_LIVE_WITH_SMTP=true

Examples:
  bash tools/go_live_gate.sh
  GO_LIVE_WITH_DEPLOY=false bash tools/go_live_gate.sh
  CREATOR_USERNAME=olmysweet GO_LIVE_REQUIRE_CREATOR=true bash tools/go_live_gate.sh
  GO_LIVE_WITH_SMTP=true RESET_SMOKE_EMAIL=you@example.com bash tools/go_live_gate.sh
  GO_LIVE_WITH_BACKUP_VERIFY=true bash tools/go_live_gate.sh
  GO_LIVE_WITH_UGC_SHOWCASE_MOD=true CREATOR_USERNAME=olmysweet bash tools/go_live_gate.sh
  GO_LIVE_SKIP_UGC_API_CONTRACT=true bash tools/go_live_gate.sh
  GO_LIVE_SKIP_UI_PAGE_PROGRESS=true bash tools/go_live_gate.sh
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "$CREATOR_USERNAME" && -f "$SMOKE_ACCESS_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$SMOKE_ACCESS_ENV_FILE"
  CREATOR_USERNAME="${CREATOR_USERNAME:-}"
fi

if [[ -z "$HEALTH_TOKEN" && -f "$HEALTH_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$HEALTH_ENV_FILE"
  HEALTH_TOKEN="${HEALTH_TOKEN:-}"
fi

if [[ -z "$HEALTH_TOKEN" && -f "$ROOT_DIR/.env" ]]; then
  HEALTH_TOKEN="$(awk -F= '/^HEALTH_TOKEN=/{print $2; exit}' "$ROOT_DIR/.env" | tr -d '\r' || true)"
fi

if [[ -z "$HEALTH_TOKEN" ]]; then
  strapi_cid="$(docker compose ps -q strapi 2>/dev/null || true)"
  if [[ -n "$strapi_cid" ]]; then
    HEALTH_TOKEN="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$strapi_cid" 2>/dev/null | awk -F= '/^HEALTH_TOKEN=/{print $2; exit}' | tr -d '\r' || true)"
  fi
fi

if [[ "$GO_LIVE_REQUIRE_CREATOR" == "true" && -z "$CREATOR_USERNAME" ]]; then
  echo "FAIL: GO_LIVE_REQUIRE_CREATOR=true but CREATOR_USERNAME is missing."
  echo "Set CREATOR_USERNAME or update $SMOKE_ACCESS_ENV_FILE"
  exit 1
fi

run_step() {
  local label="$1"
  shift

  echo
  echo ">>> ${label}"
  echo "CMD: $*"

  set +e
  "$@"
  local code=$?
  set -e

  STEP_NAMES+=("$label")
  STEP_CODES+=("$code")
  if [[ $code -eq 0 ]]; then
    STEP_STATUS+=("PASS")
    echo "RESULT: PASS (${label})"
  else
    STEP_STATUS+=("FAIL")
    echo "RESULT: FAIL (${label}) exit=${code}"
  fi
}

echo "=============================================================="
echo "GEOVITO GO-LIVE GATE"
echo "expected_sha7=${EXPECTED_SHA7}"
echo "creator_username=${CREATOR_USERNAME:-<empty>}"
echo "with_deploy=${GO_LIVE_WITH_DEPLOY} with_smtp=${GO_LIVE_WITH_SMTP} with_backup_verify=${GO_LIVE_WITH_BACKUP_VERIFY} with_ugc_showcase_mod=${GO_LIVE_WITH_UGC_SHOWCASE_MOD}"
echo "skip_pre_import=${GO_LIVE_SKIP_PRE_IMPORT} skip_pre_design=${GO_LIVE_SKIP_PRE_DESIGN} skip_ui=${GO_LIVE_SKIP_UI} skip_report_smoke=${GO_LIVE_SKIP_REPORT_SMOKE} skip_community_settings_smoke=${GO_LIVE_SKIP_COMMUNITY_SETTINGS_SMOKE} skip_ugc_api_contract=${GO_LIVE_SKIP_UGC_API_CONTRACT} skip_ui_page_progress=${GO_LIVE_SKIP_UI_PAGE_PROGRESS} skip_dashboard_role_smoke=${GO_LIVE_SKIP_DASHBOARD_ROLE_SMOKE} skip_follow_smoke=${GO_LIVE_SKIP_FOLLOW_SMOKE} skip_notification_smoke=${GO_LIVE_SKIP_NOTIFICATION_SMOKE} skip_saved_list_smoke=${GO_LIVE_SKIP_SAVED_LIST_SMOKE}"
echo "=============================================================="

if [[ "$HEALTH_TOKEN" == *"REPLACE_WITH_"* ]]; then
  HEALTH_TOKEN=""
fi

if [[ -n "$HEALTH_TOKEN" ]]; then
  run_step "Stack Health" bash -lc "cd '$ROOT_DIR' && HEALTH_TOKEN='$HEALTH_TOKEN' HEALTH_ENV_FILE='$HEALTH_ENV_FILE' bash tools/stack_health.sh"
else
  run_step "Stack Health" bash -lc "cd '$ROOT_DIR' && HEALTH_ENV_FILE='$HEALTH_ENV_FILE' bash tools/stack_health.sh"
fi

if [[ "$GO_LIVE_WITH_BACKUP_VERIFY" == "true" ]]; then
  run_step "Backup Verify" bash tools/backup_verify.sh
else
  STEP_NAMES+=("Backup Verify")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (Backup Verify)"
fi

run_step "Production Health" bash tools/prod_health.sh
run_step "Pages Build Check" bash tools/pages_build_check.sh

if [[ "$GO_LIVE_SKIP_PRE_IMPORT" != "true" ]]; then
  run_step "Pre-Import Index Gate" bash tools/pre_import_index_gate_check.sh
else
  STEP_NAMES+=("Pre-Import Index Gate")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (Pre-Import Index Gate)"
fi

if [[ "$GO_LIVE_SKIP_PRE_DESIGN" != "true" ]]; then
  run_step "Pre-Design Gate" bash tools/pre_design_gate_check.sh
else
  STEP_NAMES+=("Pre-Design Gate")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (Pre-Design Gate)"
fi

if [[ "$GO_LIVE_WITH_DEPLOY" == "true" ]]; then
  run_step "Pages Force Deploy" bash -lc "cd '$ROOT_DIR' && EXPECTED_SHA7='$EXPECTED_SHA7' bash tools/pages_deploy_force.sh"
else
  STEP_NAMES+=("Pages Force Deploy")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (Pages Force Deploy)"
fi

if [[ -n "$CREATOR_USERNAME" ]]; then
  run_step "Access Smoke" bash -lc "cd '$ROOT_DIR' && EXPECTED_SHA7='$EXPECTED_SHA7' CREATOR_USERNAME='$CREATOR_USERNAME' bash tools/smoke_access.sh"
else
  run_step "Access Smoke" bash -lc "cd '$ROOT_DIR' && EXPECTED_SHA7='$EXPECTED_SHA7' bash tools/smoke_access.sh"
fi

if [[ "$GO_LIVE_SKIP_REPORT_SMOKE" != "true" ]]; then
  run_step "Report Moderation Smoke" bash tools/report_moderation_smoke.sh
else
  STEP_NAMES+=("Report Moderation Smoke")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (Report Moderation Smoke)"
fi

if [[ "$GO_LIVE_SKIP_COMMUNITY_SETTINGS_SMOKE" != "true" ]]; then
  run_step "Community Settings Smoke" bash tools/community_settings_smoke.sh
else
  STEP_NAMES+=("Community Settings Smoke")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (Community Settings Smoke)"
fi

if [[ "$GO_LIVE_SKIP_UGC_API_CONTRACT" != "true" ]]; then
  run_step "UGC API Contract Check" bash tools/ugc_api_contract_check.sh
else
  STEP_NAMES+=("UGC API Contract Check")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (UGC API Contract Check)"
fi

if [[ "$GO_LIVE_WITH_UGC_SHOWCASE_MOD" == "true" ]]; then
  showcase_creator="${CREATOR_USERNAME:-olmysweet}"
  if [[ -n "$GO_LIVE_UGC_SHOWCASE_OWNER_EMAIL" ]]; then
    run_step "UGC Showcase Moderation Check" bash -lc "cd '$ROOT_DIR' && SHOWCASE_CREATOR_USERNAME='$showcase_creator' SHOWCASE_OWNER_EMAIL='$GO_LIVE_UGC_SHOWCASE_OWNER_EMAIL' RESTORE_TO_SUBMITTED='$GO_LIVE_UGC_SHOWCASE_RESTORE_TO_SUBMITTED' bash tools/ugc_showcase_moderation_check.sh"
  else
    run_step "UGC Showcase Moderation Check" bash -lc "cd '$ROOT_DIR' && SHOWCASE_CREATOR_USERNAME='$showcase_creator' RESTORE_TO_SUBMITTED='$GO_LIVE_UGC_SHOWCASE_RESTORE_TO_SUBMITTED' bash tools/ugc_showcase_moderation_check.sh"
  fi
else
  STEP_NAMES+=("UGC Showcase Moderation Check")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (UGC Showcase Moderation Check)"
fi

if [[ "$GO_LIVE_SKIP_UI_PAGE_PROGRESS" != "true" ]]; then
  run_step "UI Page Progress" bash tools/ui_page_progress_report.sh
else
  STEP_NAMES+=("UI Page Progress")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (UI Page Progress)"
fi

if [[ "$GO_LIVE_SKIP_DASHBOARD_ROLE_SMOKE" != "true" ]]; then
  run_step "Dashboard Role Smoke" bash tools/dashboard_role_smoke.sh
else
  STEP_NAMES+=("Dashboard Role Smoke")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (Dashboard Role Smoke)"
fi

if [[ "$GO_LIVE_SKIP_FOLLOW_SMOKE" != "true" ]]; then
  run_step "Follow System Smoke" bash tools/follow_system_smoke.sh
else
  STEP_NAMES+=("Follow System Smoke")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (Follow System Smoke)"
fi

if [[ "$GO_LIVE_SKIP_NOTIFICATION_SMOKE" != "true" ]]; then
  run_step "Notification Preferences Smoke" bash tools/notification_preferences_smoke.sh
else
  STEP_NAMES+=("Notification Preferences Smoke")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (Notification Preferences Smoke)"
fi

if [[ "$GO_LIVE_SKIP_SAVED_LIST_SMOKE" != "true" ]]; then
  run_step "Saved List Smoke" bash tools/saved_list_smoke.sh
else
  STEP_NAMES+=("Saved List Smoke")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (Saved List Smoke)"
fi

if [[ "$GO_LIVE_SKIP_UI" != "true" ]]; then
  run_step "Account Queue UI Smoke" bash tools/account_comment_queue_test.sh
  run_step "Dashboard Activity UI Smoke" bash tools/dashboard_activity_ui_playwright.sh
else
  STEP_NAMES+=("Account Queue UI Smoke")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  STEP_NAMES+=("Dashboard Activity UI Smoke")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (Account Queue UI Smoke)"
  echo "RESULT: SKIP (Dashboard Activity UI Smoke)"
fi

if [[ "$GO_LIVE_WITH_SMTP" == "true" ]]; then
  if [[ -z "$RESET_SMOKE_EMAIL" ]]; then
    STEP_NAMES+=("SMTP Reset Smoke")
    STEP_STATUS+=("FAIL")
    STEP_CODES+=("2")
    echo "RESULT: FAIL (SMTP Reset Smoke) RESET_SMOKE_EMAIL is required"
  else
    run_step "SMTP Reset Smoke" bash -lc "cd '$ROOT_DIR' && RESET_SMOKE_EMAIL='$RESET_SMOKE_EMAIL' bash tools/password_reset_smoke.sh"
  fi
else
  STEP_NAMES+=("SMTP Reset Smoke")
  STEP_STATUS+=("SKIP")
  STEP_CODES+=("0")
  echo "RESULT: SKIP (SMTP Reset Smoke)"
fi

echo
echo "================ GO-LIVE SUMMARY ================"
fail_count=0
skip_count=0
for i in "${!STEP_NAMES[@]}"; do
  status="${STEP_STATUS[$i]}"
  name="${STEP_NAMES[$i]}"
  code="${STEP_CODES[$i]}"
  echo "${status} | ${name} | exit=${code}"
  if [[ "$status" == "FAIL" ]]; then
    fail_count=$((fail_count + 1))
  fi
  if [[ "$status" == "SKIP" ]]; then
    skip_count=$((skip_count + 1))
  fi
done
echo "==============================================="

if [[ $fail_count -gt 0 ]]; then
  echo "GO-LIVE GATE: FAIL (${fail_count} failed, ${skip_count} skipped)"
  exit 1
fi

echo "GO-LIVE GATE: PASS (${skip_count} skipped)"
