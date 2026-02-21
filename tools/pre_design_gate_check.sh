#!/usr/bin/env bash
set -u -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FAIL_COUNT=0
SUMMARY_LINES=()

run_gate() {
  local name="$1"
  shift
  local cmd=("$@")

  echo ""
  echo ">>> ${name}"
  echo "CMD: ${cmd[*]}"

  set +e
  "${cmd[@]}"
  local code=$?
  set -e

  if [[ $code -eq 0 ]]; then
    echo "RESULT: PASS (${name})"
    SUMMARY_LINES+=("PASS | ${name} | exit=0")
  else
    echo "RESULT: FAIL (${name}) exit=${code}"
    SUMMARY_LINES+=("FAIL | ${name} | exit=${code}")
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

echo "=============================================================="
echo "GEOVITO PRE-DESIGN GATE CHECK"
echo "=============================================================="

run_gate "Prepare Strapi Runtime" docker compose up -d --build strapi

run_gate "Production Health" bash tools/prod_health.sh
run_gate "Media Policy Guard" bash tools/media_policy_check.sh
if [[ -n "${STRAPI_API_TOKEN:-}" || -f "${MEDIA_SMOKE_ENV_FILE:-$HOME/.config/geovito/media_smoke.env}" ]]; then
  run_gate "Media Upload Smoke" bash tools/media_smoke.sh
else
  echo "RESULT: SKIP (Media Upload Smoke) token missing: export STRAPI_API_TOKEN=..."
  echo "  or create ~/.config/geovito/media_smoke.env via: bash tools/media_smoke_env_init.sh"
  SUMMARY_LINES+=("SKIP | Media Upload Smoke | token_missing")
fi
run_gate "Auth Flow Guard" bash tools/auth_flow_check.sh
run_gate "OAuth Config Guard" bash tools/oauth_config_check.sh
run_gate "Blog Comment State Contract" bash tools/blog_comment_state_contract_check.sh
run_gate "Blog Engagement Policy Guard" bash tools/blog_engagement_policy_check.sh
run_gate "Blog Engagement Smoke" bash tools/blog_engagement_smoke.sh
if [[ "${RUN_BLOG_ENGAGEMENT_UI_GATE:-false}" == "true" ]]; then
  run_gate "Blog Engagement UI Playwright" bash tools/blog_engagement_ui_playwright.sh
else
  echo "RESULT: SKIP (Blog Engagement UI Playwright) set RUN_BLOG_ENGAGEMENT_UI_GATE=true to enable"
  SUMMARY_LINES+=("SKIP | Blog Engagement UI Playwright | opt_in")
fi
if [[ "${RUN_COMMENT_BULK_GATE:-false}" == "true" ]]; then
  COMMENT_BULK_ACTION_VALUE="${COMMENT_BULK_ACTION:-}"
  COMMENT_BULK_LIMIT_VALUE="${COMMENT_BULK_LIMIT:-10}"
  COMMENT_BULK_NOTES_VALUE="${COMMENT_BULK_NOTES:-pre-design bulk moderation}"

  case "$COMMENT_BULK_ACTION_VALUE" in
    approve-next-bulk|reject-next-bulk|spam-next-bulk|delete-next-bulk)
      run_gate \
        "Comment Bulk Quick Action" \
        bash tools/blog_comment_quick_action.sh \
          "$COMMENT_BULK_ACTION_VALUE" \
          --limit "$COMMENT_BULK_LIMIT_VALUE" \
          --notes "$COMMENT_BULK_NOTES_VALUE"
      ;;
    *)
      echo "RESULT: FAIL (Comment Bulk Quick Action) invalid COMMENT_BULK_ACTION"
      echo "  expected: approve-next-bulk|reject-next-bulk|spam-next-bulk|delete-next-bulk"
      SUMMARY_LINES+=("FAIL | Comment Bulk Quick Action | invalid_COMMENT_BULK_ACTION")
      FAIL_COUNT=$((FAIL_COUNT + 1))
      ;;
  esac
else
  echo "RESULT: SKIP (Comment Bulk Quick Action) set RUN_COMMENT_BULK_GATE=true to enable"
  SUMMARY_LINES+=("SKIP | Comment Bulk Quick Action | opt_in")
fi
run_gate "Import Dormant Guard" bash tools/import_dormant_check.sh
run_gate "Translation Bundle Dormant Guard" bash tools/translation_bundle_dormant_check.sh
run_gate "Import Log Domain Sanity" bash tools/import_log_sanity_check.sh
run_gate "Pre-Import Index Gate" bash tools/pre_import_index_gate_check.sh
run_gate "Shell Smoke Test" env SHELL_SMOKE_REUSE_DIST=1 bash tools/shell_smoke_test.sh
run_gate "Cloudflare Pages Build Check" bash tools/pages_build_check.sh
run_gate "Final Mock Purge Cleanup" bash tools/purge_mock.sh

echo ""
echo "================ PRE-DESIGN SUMMARY ================"
for line in "${SUMMARY_LINES[@]}"; do
  echo "$line"
done
echo "===================================================="

if [[ $FAIL_COUNT -gt 0 ]]; then
  echo "PRE-DESIGN GATE: FAIL (${FAIL_COUNT} failing gate)"
  exit 1
fi

echo "PRE-DESIGN GATE: PASS"
exit 0
