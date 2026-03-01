#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_DEPLOY="true"
RUN_SMOKE="true"
RUN_MODERATION="false"
RUN_ACCOUNT_TEST="true"
RUN_BLOG_ENGAGEMENT_TEST="false"
RUN_DASHBOARD_TEST="true"
RUN_DASHBOARD_ROLE_SMOKE="false"
RUN_FOLLOW_SMOKE="false"
RUN_NOTIFICATION_SMOKE="false"
RUN_REPORT_SMOKE="true"
RUN_COMMUNITY_SETTINGS_SMOKE="true"
RUN_UGC_API_CONTRACT="false"
RUN_COMMENT_BULK_ACTION="false"
RUN_MOCK_RESEED="false"
RUN_UI_LOCALE_SYNC="false"
RUN_UI_LOCALE_PROGRESS="false"
RUN_CREATOR_SMOKE="false"

usage() {
  cat <<'USAGE'
Usage:
  bash tools/release_deploy_smoke.sh [--skip-deploy] [--skip-smoke] [--with-moderation] [--skip-account-test] [--with-account-test] [--with-blog-engagement-test] [--skip-dashboard-test] [--with-dashboard-role-smoke] [--with-follow-smoke] [--with-notification-smoke] [--skip-report-smoke] [--skip-community-settings-smoke] [--with-ugc-api-contract] [--with-comment-bulk-action] [--with-mock-reseed] [--with-ui-locale-sync] [--with-ui-locale-progress] [--with-creator-smoke]

Purpose:
  Single command release verification:
  1) Force Cloudflare Pages deploy to current HEAD SHA
  2) Run domain smoke check via Access token
  3) (Optional) Run blog moderation stale-pending guard
  4) (Default) Run account comment queue Playwright smoke
  5) (Optional) Run blog engagement Playwright smoke (auto-seed if needed)
  6) (Default) Run dashboard activity Playwright smoke
  7) (Optional) Run dashboard role matrix smoke (super admin + alt admin + member baseline)
  8) (Optional) Run follow system foundation smoke
  9) (Optional) Run notification preferences foundation smoke
  10) (Default) Run content report moderation smoke
  11) (Default) Run community settings role/contract smoke
  12) (Optional) Run UGC API contract check
  13) (Optional) Run bulk moderation action on oldest pending comments
  14) (Optional) Re-seed mock dataset at end (useful after purge flows)
  15) (Optional) Sync ui-locale import/export flow before release checks
  16) (Optional) Validate ui-locale progress report (strict by default)
  17) (Optional/Auto) Validate creator mini-site + @ alias redirect in smoke stage

Notes:
  - pages deploy hook must be configured:
      bash tools/pages_deploy_env_init.sh
      nano ~/.config/geovito/pages_deploy.env
  - smoke access secrets must be configured:
      bash tools/smoke_access_env_init.sh
      nano ~/.config/geovito/smoke_access.env

Env passthrough:
  EXPECTED_SHA7, BASE_URL, FINGERPRINT_BASE_URL, DEPLOY_TIMEOUT_SECONDS,
  DEPLOY_POLL_INTERVAL_SECONDS, PAGES_DEPLOY_ENV_FILE, SMOKE_ACCESS_ENV_FILE,
  CREATOR_USERNAME,
  API_BASE,
  SMOKE_BLOG_MODERATION_ARGS, COMMENT_BULK_ACTION, COMMENT_BULK_LIMIT, COMMENT_BULK_NOTES, COMMENT_BULK_DRY_RUN, COMMENT_BULK_REPORT_OUTPUT,
  UI_LOCALE_PROGRESS_REPORT, UI_LOCALE_PROGRESS_STRICT, UI_LOCALE_SYNC_BUILD_CHECK

Creator smoke auto behavior:
  - If CREATOR_USERNAME is provided (env or SMOKE_ACCESS_ENV_FILE), creator checks auto-enable.
  - You can still force explicitly with --with-creator-smoke.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-deploy)
      RUN_DEPLOY="false"
      shift
      ;;
    --skip-smoke)
      RUN_SMOKE="false"
      shift
      ;;
    --with-moderation)
      RUN_MODERATION="true"
      shift
      ;;
    --with-account-test)
      RUN_ACCOUNT_TEST="true"
      shift
      ;;
    --skip-account-test)
      RUN_ACCOUNT_TEST="false"
      shift
      ;;
    --with-blog-engagement-test)
      RUN_BLOG_ENGAGEMENT_TEST="true"
      shift
      ;;
    --with-dashboard-test)
      RUN_DASHBOARD_TEST="true"
      shift
      ;;
    --skip-dashboard-test)
      RUN_DASHBOARD_TEST="false"
      shift
      ;;
    --with-dashboard-role-smoke)
      RUN_DASHBOARD_ROLE_SMOKE="true"
      shift
      ;;
    --with-follow-smoke)
      RUN_FOLLOW_SMOKE="true"
      shift
      ;;
    --with-notification-smoke)
      RUN_NOTIFICATION_SMOKE="true"
      shift
      ;;
    --skip-report-smoke)
      RUN_REPORT_SMOKE="false"
      shift
      ;;
    --skip-community-settings-smoke)
      RUN_COMMUNITY_SETTINGS_SMOKE="false"
      shift
      ;;
    --with-ugc-api-contract)
      RUN_UGC_API_CONTRACT="true"
      shift
      ;;
    --with-comment-bulk-action)
      RUN_COMMENT_BULK_ACTION="true"
      shift
      ;;
    --with-mock-reseed)
      RUN_MOCK_RESEED="true"
      shift
      ;;
    --with-ui-locale-sync)
      RUN_UI_LOCALE_SYNC="true"
      shift
      ;;
    --with-ui-locale-progress)
      RUN_UI_LOCALE_PROGRESS="true"
      shift
      ;;
    --with-creator-smoke)
      RUN_CREATOR_SMOKE="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

EXPECTED_SHA7="${EXPECTED_SHA7:-$(git rev-parse --short=7 HEAD)}"
SMOKE_ACCESS_ENV_FILE="${SMOKE_ACCESS_ENV_FILE:-$HOME/.config/geovito/smoke_access.env}"
CREATOR_USERNAME="${CREATOR_USERNAME:-}"

# Auto-enable creator smoke when username exists in env or smoke access env file.
if [[ -z "$CREATOR_USERNAME" && -f "$SMOKE_ACCESS_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$SMOKE_ACCESS_ENV_FILE"
  CREATOR_USERNAME="${CREATOR_USERNAME:-}"
fi

if [[ -n "$CREATOR_USERNAME" && "$RUN_CREATOR_SMOKE" != "true" ]]; then
  RUN_CREATOR_SMOKE="true"
fi

echo "=============================================================="
echo "GEOVITO RELEASE DEPLOY+SMOKE"
echo "expected_sha7=${EXPECTED_SHA7}"
echo "run_deploy=${RUN_DEPLOY} run_smoke=${RUN_SMOKE} run_moderation=${RUN_MODERATION} run_account_test=${RUN_ACCOUNT_TEST} run_blog_engagement_test=${RUN_BLOG_ENGAGEMENT_TEST} run_dashboard_test=${RUN_DASHBOARD_TEST} run_dashboard_role_smoke=${RUN_DASHBOARD_ROLE_SMOKE} run_follow_smoke=${RUN_FOLLOW_SMOKE} run_notification_smoke=${RUN_NOTIFICATION_SMOKE} run_report_smoke=${RUN_REPORT_SMOKE} run_community_settings_smoke=${RUN_COMMUNITY_SETTINGS_SMOKE} run_ugc_api_contract=${RUN_UGC_API_CONTRACT} run_comment_bulk_action=${RUN_COMMENT_BULK_ACTION} run_mock_reseed=${RUN_MOCK_RESEED} run_ui_locale_sync=${RUN_UI_LOCALE_SYNC} run_ui_locale_progress=${RUN_UI_LOCALE_PROGRESS} run_creator_smoke=${RUN_CREATOR_SMOKE}"
echo "=============================================================="

if [[ "$RUN_DEPLOY" == "true" ]]; then
  EXPECTED_SHA7="$EXPECTED_SHA7" bash tools/pages_deploy_force.sh
else
  echo "INFO: skipped deploy stage (--skip-deploy)"
fi

if [[ "$RUN_SMOKE" == "true" ]]; then
  if [[ "$RUN_CREATOR_SMOKE" == "true" && -z "$CREATOR_USERNAME" ]]; then
    echo "ERROR: --with-creator-smoke requires CREATOR_USERNAME=<existing_username>"
    exit 1
  fi

  if [[ "$RUN_MODERATION" == "true" ]]; then
    SMOKE_RUN_BLOG_MODERATION_REPORT="true" \
    CREATOR_USERNAME="$CREATOR_USERNAME" \
    EXPECTED_SHA7="$EXPECTED_SHA7" \
    bash tools/smoke_access.sh
  else
    CREATOR_USERNAME="$CREATOR_USERNAME" \
    EXPECTED_SHA7="$EXPECTED_SHA7" \
    bash tools/smoke_access.sh
  fi
else
  echo "INFO: skipped smoke stage (--skip-smoke)"
fi

if [[ "$RUN_ACCOUNT_TEST" == "true" ]]; then
  bash tools/account_comment_queue_test.sh
else
  echo "INFO: skipped account queue test stage (--skip-account-test)"
fi

if [[ "$RUN_BLOG_ENGAGEMENT_TEST" == "true" ]]; then
  bash tools/blog_engagement_ui_playwright.sh
else
  echo "INFO: skipped blog engagement ui test stage (use --with-blog-engagement-test)"
fi

if [[ "$RUN_DASHBOARD_TEST" == "true" ]]; then
  bash tools/dashboard_activity_ui_playwright.sh
else
  echo "INFO: skipped dashboard activity ui test stage (--skip-dashboard-test)"
fi

if [[ "$RUN_DASHBOARD_ROLE_SMOKE" == "true" ]]; then
  bash tools/dashboard_role_smoke.sh
else
  echo "INFO: skipped dashboard role smoke stage (use --with-dashboard-role-smoke)"
fi

if [[ "$RUN_FOLLOW_SMOKE" == "true" ]]; then
  bash tools/follow_system_smoke.sh
else
  echo "INFO: skipped follow system smoke stage (use --with-follow-smoke)"
fi

if [[ "$RUN_NOTIFICATION_SMOKE" == "true" ]]; then
  bash tools/notification_preferences_smoke.sh
else
  echo "INFO: skipped notification preferences smoke stage (use --with-notification-smoke)"
fi

if [[ "$RUN_REPORT_SMOKE" == "true" ]]; then
  bash tools/report_moderation_smoke.sh
else
  echo "INFO: skipped report moderation smoke stage (--skip-report-smoke)"
fi

if [[ "$RUN_COMMUNITY_SETTINGS_SMOKE" == "true" ]]; then
  bash tools/community_settings_smoke.sh
else
  echo "INFO: skipped community settings smoke stage (--skip-community-settings-smoke)"
fi

if [[ "$RUN_UGC_API_CONTRACT" == "true" ]]; then
  bash tools/ugc_api_contract_check.sh
else
  echo "INFO: skipped UGC API contract stage (use --with-ugc-api-contract)"
fi

if [[ "$RUN_COMMENT_BULK_ACTION" == "true" ]]; then
  BULK_ACTION="${COMMENT_BULK_ACTION:-}"
  BULK_LIMIT="${COMMENT_BULK_LIMIT:-10}"
  BULK_NOTES="${COMMENT_BULK_NOTES:-release bulk moderation}"
  BULK_DRY_RUN="${COMMENT_BULK_DRY_RUN:-false}"
  BULK_REPORT_OUTPUT="${COMMENT_BULK_REPORT_OUTPUT:-}"

  case "$BULK_ACTION" in
    approve-next-bulk|reject-next-bulk|spam-next-bulk|delete-next-bulk)
      ;;
    *)
      echo "ERROR: --with-comment-bulk-action requires COMMENT_BULK_ACTION in:"
      echo "  approve-next-bulk | reject-next-bulk | spam-next-bulk | delete-next-bulk"
      echo "Example:"
      echo "  COMMENT_BULK_ACTION=approve-next-bulk COMMENT_BULK_LIMIT=10 bash tools/release_deploy_smoke.sh --with-comment-bulk-action"
      exit 1
      ;;
  esac

  echo "INFO: running bulk moderation action"
  echo "  action=${BULK_ACTION} limit=${BULK_LIMIT} dry_run=${BULK_DRY_RUN}"
  BULK_CMD=(bash tools/blog_comment_bulk_report.sh --action "$BULK_ACTION" --limit "$BULK_LIMIT" --notes "$BULK_NOTES")
  if [[ "$BULK_DRY_RUN" == "true" || "$BULK_DRY_RUN" == "1" ]]; then
    BULK_CMD+=(--dry-run)
  fi
  if [[ -n "$BULK_REPORT_OUTPUT" ]]; then
    BULK_CMD+=(--output "$BULK_REPORT_OUTPUT")
  fi
  "${BULK_CMD[@]}"
else
  echo "INFO: skipped comment bulk action stage (use --with-comment-bulk-action)"
fi

if [[ "$RUN_MOCK_RESEED" == "true" ]]; then
  echo "INFO: running mock reseed stage"
  env ALLOW_MOCK_SEED=true bash tools/mock_data.sh seed
else
  echo "INFO: skipped mock reseed stage (use --with-mock-reseed)"
fi

if [[ "$RUN_UI_LOCALE_SYNC" == "true" ]]; then
  echo "INFO: running ui-locale sync stage"
  if [[ "${UI_LOCALE_SYNC_BUILD_CHECK:-false}" == "true" ]]; then
    bash tools/ui_locale_sync.sh
  else
    bash tools/ui_locale_sync.sh --no-build-check
  fi
else
  echo "INFO: skipped ui-locale sync stage (use --with-ui-locale-sync)"
fi

if [[ "$RUN_UI_LOCALE_PROGRESS" == "true" ]]; then
  echo "INFO: running ui-locale progress stage"
  REPORT_PATH="${UI_LOCALE_PROGRESS_REPORT:-$ROOT_DIR/artifacts/ui-locale-progress.json}"
  if [[ ! -f "$REPORT_PATH" ]]; then
    echo "INFO: ui-locale progress report missing, auto-exporting"
    bash tools/export_ui_locales.sh
  fi
  UI_LOCALE_PROGRESS_STRICT="${UI_LOCALE_PROGRESS_STRICT:-true}" \
    bash tools/ui_locale_progress_report.sh
else
  echo "INFO: skipped ui-locale progress stage (use --with-ui-locale-progress)"
fi

echo "=============================================================="
echo "RELEASE DEPLOY+SMOKE: PASS"
echo "=============================================================="
