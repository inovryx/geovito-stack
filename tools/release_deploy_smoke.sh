#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_DEPLOY="true"
RUN_SMOKE="true"
RUN_MODERATION="false"
RUN_ACCOUNT_TEST="false"
RUN_BLOG_ENGAGEMENT_TEST="false"
RUN_COMMENT_BULK_ACTION="false"

usage() {
  cat <<'USAGE'
Usage:
  bash tools/release_deploy_smoke.sh [--skip-deploy] [--skip-smoke] [--with-moderation] [--with-account-test] [--with-blog-engagement-test] [--with-comment-bulk-action]

Purpose:
  Single command release verification:
  1) Force Cloudflare Pages deploy to current HEAD SHA
  2) Run domain smoke check via Access token
  3) (Optional) Run blog moderation stale-pending guard
  4) (Optional) Run account comment queue Playwright smoke
  5) (Optional) Run blog engagement Playwright smoke (auto-seed if needed)
  6) (Optional) Run bulk moderation action on oldest pending comments

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
  SMOKE_BLOG_MODERATION_ARGS, COMMENT_BULK_ACTION, COMMENT_BULK_LIMIT, COMMENT_BULK_NOTES
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
    --with-blog-engagement-test)
      RUN_BLOG_ENGAGEMENT_TEST="true"
      shift
      ;;
    --with-comment-bulk-action)
      RUN_COMMENT_BULK_ACTION="true"
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

echo "=============================================================="
echo "GEOVITO RELEASE DEPLOY+SMOKE"
echo "expected_sha7=${EXPECTED_SHA7}"
echo "run_deploy=${RUN_DEPLOY} run_smoke=${RUN_SMOKE} run_moderation=${RUN_MODERATION} run_account_test=${RUN_ACCOUNT_TEST} run_blog_engagement_test=${RUN_BLOG_ENGAGEMENT_TEST} run_comment_bulk_action=${RUN_COMMENT_BULK_ACTION}"
echo "=============================================================="

if [[ "$RUN_DEPLOY" == "true" ]]; then
  EXPECTED_SHA7="$EXPECTED_SHA7" bash tools/pages_deploy_force.sh
else
  echo "INFO: skipped deploy stage (--skip-deploy)"
fi

if [[ "$RUN_SMOKE" == "true" ]]; then
  if [[ "$RUN_MODERATION" == "true" ]]; then
    SMOKE_RUN_BLOG_MODERATION_REPORT="true" \
    EXPECTED_SHA7="$EXPECTED_SHA7" \
    bash tools/smoke_access.sh
  else
    EXPECTED_SHA7="$EXPECTED_SHA7" bash tools/smoke_access.sh
  fi
else
  echo "INFO: skipped smoke stage (--skip-smoke)"
fi

if [[ "$RUN_ACCOUNT_TEST" == "true" ]]; then
  bash tools/account_comment_queue_test.sh
else
  echo "INFO: skipped account queue test stage (use --with-account-test)"
fi

if [[ "$RUN_BLOG_ENGAGEMENT_TEST" == "true" ]]; then
  bash tools/blog_engagement_ui_playwright.sh
else
  echo "INFO: skipped blog engagement ui test stage (use --with-blog-engagement-test)"
fi

if [[ "$RUN_COMMENT_BULK_ACTION" == "true" ]]; then
  BULK_ACTION="${COMMENT_BULK_ACTION:-}"
  BULK_LIMIT="${COMMENT_BULK_LIMIT:-10}"
  BULK_NOTES="${COMMENT_BULK_NOTES:-release bulk moderation}"

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
  echo "  action=${BULK_ACTION} limit=${BULK_LIMIT}"
  bash tools/blog_comment_quick_action.sh "$BULK_ACTION" --limit "$BULK_LIMIT" --notes "$BULK_NOTES"
else
  echo "INFO: skipped comment bulk action stage (use --with-comment-bulk-action)"
fi

echo "=============================================================="
echo "RELEASE DEPLOY+SMOKE: PASS"
echo "=============================================================="
