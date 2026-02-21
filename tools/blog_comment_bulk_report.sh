#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ACTION=""
LIMIT="10"
NOTES="bulk moderation"
DRY_RUN="false"
OUTPUT_PATH=""

usage() {
  cat <<'USAGE'
Usage:
  bash tools/blog_comment_bulk_report.sh --action <action> [--limit 10] [--notes "text"] [--dry-run] [--output artifacts/moderation/file.json]

Actions:
  approve-next-bulk
  reject-next-bulk
  spam-next-bulk
  delete-next-bulk
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --action)
      ACTION="${2:-}"
      shift 2
      ;;
    --limit)
      LIMIT="${2:-10}"
      shift 2
      ;;
    --notes)
      NOTES="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --output)
      OUTPUT_PATH="${2:-}"
      shift 2
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

if [[ -z "$ACTION" ]]; then
  echo "ERROR: --action is required"
  usage
  exit 1
fi

STATUS=""
case "$ACTION" in
  approve-next-bulk) STATUS="approved" ;;
  reject-next-bulk) STATUS="rejected" ;;
  spam-next-bulk) STATUS="spam" ;;
  delete-next-bulk) STATUS="deleted" ;;
  *)
    echo "ERROR: invalid --action value: $ACTION"
    usage
    exit 1
    ;;
esac

if [[ -z "$OUTPUT_PATH" ]]; then
  TS="$(date -u +%Y%m%dT%H%M%SZ)"
  OUTPUT_PATH="$ROOT_DIR/artifacts/moderation/comment-bulk-report-${ACTION}-${TS}.json"
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

TMP_OUTPUT="$(mktemp)"
trap 'rm -f "$TMP_OUTPUT"' EXIT

echo "=============================================================="
echo "GEOVITO BLOG COMMENT BULK REPORT"
echo "action=${ACTION} status=${STATUS} limit=${LIMIT} dry_run=${DRY_RUN}"
echo "output=${OUTPUT_PATH}"
echo "=============================================================="

CMD=(bash tools/blog_comment_moderate.sh bulk-set-next "$STATUS" --limit "$LIMIT" --notes "$NOTES" --json)
if [[ "$DRY_RUN" == "true" ]]; then
  CMD+=(--dry-run)
fi

"${CMD[@]}" | tee "$TMP_OUTPUT"

JSON_LINE="$(grep '^JSON_OUTPUT:' "$TMP_OUTPUT" | tail -n1 || true)"
if [[ -z "$JSON_LINE" ]]; then
  echo "FAIL: JSON_OUTPUT line not found in moderation command output"
  exit 1
fi

JSON_PAYLOAD="${JSON_LINE#JSON_OUTPUT:}"
printf '%s\n' "$JSON_PAYLOAD" > "$OUTPUT_PATH"

echo "PASS: moderation report written -> $OUTPUT_PATH"
