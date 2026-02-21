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
  approve-next-bulk)
    bash tools/blog_comment_moderate.sh bulk-set-next approved "$@"
    ;;
  reject-next)
    bash tools/blog_comment_moderate.sh set-next rejected "$@"
    ;;
  reject-next-bulk)
    bash tools/blog_comment_moderate.sh bulk-set-next rejected "$@"
    ;;
  spam-next)
    bash tools/blog_comment_moderate.sh set-next spam "$@"
    ;;
  spam-next-bulk)
    bash tools/blog_comment_moderate.sh bulk-set-next spam "$@"
    ;;
  delete-next)
    bash tools/blog_comment_moderate.sh set-next deleted "$@"
    ;;
  delete-next-bulk)
    bash tools/blog_comment_moderate.sh bulk-set-next deleted "$@"
    ;;
  *)
    cat <<'USAGE'
Usage:
  bash tools/blog_comment_quick_action.sh next
  bash tools/blog_comment_quick_action.sh approve-next [--notes "text"] [--dry-run]
  bash tools/blog_comment_quick_action.sh approve-next-bulk [--limit 20] [--notes "text"] [--dry-run]
  bash tools/blog_comment_quick_action.sh reject-next [--notes "text"] [--dry-run]
  bash tools/blog_comment_quick_action.sh reject-next-bulk [--limit 20] [--notes "text"] [--dry-run]
  bash tools/blog_comment_quick_action.sh spam-next [--notes "text"] [--dry-run]
  bash tools/blog_comment_quick_action.sh spam-next-bulk [--limit 20] [--notes "text"] [--dry-run]
  bash tools/blog_comment_quick_action.sh delete-next [--notes "text"] [--dry-run]
  bash tools/blog_comment_quick_action.sh delete-next-bulk [--limit 20] [--notes "text"] [--dry-run]

Shortcuts:
  next         -> show oldest pending comment
  approve-next -> set oldest pending to approved
  approve-next-bulk -> set oldest pending N comments to approved
  reject-next  -> set oldest pending to rejected
  reject-next-bulk -> set oldest pending N comments to rejected
  spam-next    -> set oldest pending to spam
  spam-next-bulk -> set oldest pending N comments to spam
  delete-next  -> set oldest pending to deleted
  delete-next-bulk -> set oldest pending N comments to deleted
USAGE
    exit 1
    ;;
esac
