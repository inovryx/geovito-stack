#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ACTION="${1:-next}"
shift || true

case "$ACTION" in
  next)
    bash tools/blog_comment_moderate.sh next "$@"
    ;;
  approve-next)
    bash tools/blog_comment_moderate.sh set-next approved "$@"
    ;;
  reject-next)
    bash tools/blog_comment_moderate.sh set-next rejected "$@"
    ;;
  spam-next)
    bash tools/blog_comment_moderate.sh set-next spam "$@"
    ;;
  delete-next)
    bash tools/blog_comment_moderate.sh set-next deleted "$@"
    ;;
  *)
    cat <<'USAGE'
Usage:
  bash tools/blog_comment_quick_action.sh next
  bash tools/blog_comment_quick_action.sh approve-next [--notes "text"]
  bash tools/blog_comment_quick_action.sh reject-next [--notes "text"]
  bash tools/blog_comment_quick_action.sh spam-next [--notes "text"]
  bash tools/blog_comment_quick_action.sh delete-next [--notes "text"]

Shortcuts:
  next         -> show oldest pending comment
  approve-next -> set oldest pending to approved
  reject-next  -> set oldest pending to rejected
  spam-next    -> set oldest pending to spam
  delete-next  -> set oldest pending to deleted
USAGE
    exit 1
    ;;
esac
