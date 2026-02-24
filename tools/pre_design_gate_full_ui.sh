#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_UGC_API_CONTRACT_GATE_VALUE="false"
DRY_RUN="false"

usage() {
  cat <<'USAGE'
Usage:
  bash tools/pre_design_gate_full_ui.sh [--with-ugc-api-contract] [--dry-run]

Purpose:
  Run pre-design gate with full UI stages enabled by default:
    - Blog Engagement UI Playwright
    - Dashboard Activity UI Playwright

Options:
  --with-ugc-api-contract   Also enable UGC API Contract stage.
  --dry-run                 Print resolved env/command and exit.
  -h, --help                Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-ugc-api-contract)
      RUN_UGC_API_CONTRACT_GATE_VALUE="true"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
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

echo "=============================================================="
echo "GEOVITO PRE-DESIGN FULL UI GATE"
echo "RUN_BLOG_ENGAGEMENT_UI_GATE=true"
echo "RUN_DASHBOARD_UI_GATE=true"
echo "RUN_UGC_API_CONTRACT_GATE=${RUN_UGC_API_CONTRACT_GATE_VALUE}"
echo "=============================================================="

CMD=(
  env
  RUN_BLOG_ENGAGEMENT_UI_GATE=true
  RUN_DASHBOARD_UI_GATE=true
  RUN_UGC_API_CONTRACT_GATE="$RUN_UGC_API_CONTRACT_GATE_VALUE"
  bash tools/pre_design_gate_check.sh
)

if [[ "$DRY_RUN" == "true" ]]; then
  printf 'DRY-RUN CMD:'
  for token in "${CMD[@]}"; do
    printf ' %q' "$token"
  done
  printf '\n'
  exit 0
fi

"${CMD[@]}"
