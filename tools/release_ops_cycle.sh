#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-$HOME/.config/geovito/backup.env}"
RESET_SMOKE_EMAIL="${RESET_SMOKE_EMAIL:-${EMAIL_SMOKE_TO:-}}"
CREATOR_USERNAME="${CREATOR_USERNAME:-}"
RESTORE_TARGET="${RESTORE_TARGET:-staging}"
BACKUP_STAMP="${BACKUP_STAMP:-}"

GO_LIVE_BASELINE_READINESS_STRICT="${GO_LIVE_BASELINE_READINESS_STRICT:-true}"
GO_LIVE_WITH_DR_CRON_SCHEDULE_CHECK="${GO_LIVE_WITH_DR_CRON_SCHEDULE_CHECK:-true}"
GO_LIVE_WITH_BACKUP_VERIFY="${GO_LIVE_WITH_BACKUP_VERIFY:-true}"
GO_LIVE_WITH_SMTP="${GO_LIVE_WITH_SMTP:-true}"

RELEASE_CYCLE_DRY_RUN="${RELEASE_CYCLE_DRY_RUN:-false}"
RELEASE_CYCLE_PUSH_TAG="${RELEASE_CYCLE_PUSH_TAG:-true}"
RELEASE_CYCLE_PUSH_DOCS="${RELEASE_CYCLE_PUSH_DOCS:-true}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="${RELEASE_CYCLE_LOG_FILE:-artifacts/release/release-cycle-${STAMP}.log}"

pass() { echo "PASS: $1"; }
warn() { echo "WARN: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

[[ -n "$RESET_SMOKE_EMAIL" ]] || fail "RESET_SMOKE_EMAIL (or EMAIL_SMOKE_TO) is required"

mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

run_and_capture() {
  local label="$1"
  shift
  echo
  echo ">>> ${label}"
  set +e
  "$@"
  local code=$?
  set -e
  if [[ $code -ne 0 ]]; then
    fail "${label} failed (exit=${code})"
  fi
  pass "${label}"
}

echo "=============================================================="
echo "GEOVITO RELEASE OPS CYCLE (ONE COMMAND)"
echo "root_dir=${ROOT_DIR}"
echo "backup_env_file=${BACKUP_ENV_FILE}"
echo "restore_target=${RESTORE_TARGET}"
echo "baseline_strict=${GO_LIVE_BASELINE_READINESS_STRICT}"
echo "with_dr_cron_schedule_check=${GO_LIVE_WITH_DR_CRON_SCHEDULE_CHECK}"
echo "with_backup_verify=${GO_LIVE_WITH_BACKUP_VERIFY}"
echo "with_smtp=${GO_LIVE_WITH_SMTP}"
echo "creator_username=${CREATOR_USERNAME:-<empty>}"
echo "dry_run=${RELEASE_CYCLE_DRY_RUN}"
echo "log_file=${LOG_FILE}"
echo "=============================================================="

if [[ "$RELEASE_CYCLE_DRY_RUN" == "true" ]]; then
  echo "DRY RUN PLAN:"
  echo "1) git pull --ff-only"
  echo "2) source ${BACKUP_ENV_FILE}"
  echo "3) detect latest snapshot stamp from \${BACKUP_ROOT}"
  echo "4) run tools/dr_weekly_restore_cycle.sh"
  echo "5) run strict tools/go_live_gate_full.sh"
  echo "6) create + push checkpoint tag"
  echo "7) run tools/release_docs_auto_sync.sh"
  echo "8) run tools/release_docs_sync_check.sh"
  echo "9) commit/push docs sync"
  exit 0
fi

run_and_capture "Git Pull" git pull --ff-only

[[ -f "$BACKUP_ENV_FILE" ]] || fail "backup env file not found: ${BACKUP_ENV_FILE}"
source "$BACKUP_ENV_FILE"
pass "backup env loaded"

if [[ -z "$BACKUP_STAMP" ]]; then
  BACKUP_STAMP="$(
    find "${BACKUP_ROOT:-$HOME/backups/geovito}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
      | rg '^[0-9]{8}T[0-9]{6}Z$' \
      | sort \
      | tail -n1
  )"
fi
[[ -n "$BACKUP_STAMP" ]] || fail "no valid backup snapshot stamp found under ${BACKUP_ROOT:-$HOME/backups/geovito}"
pass "backup stamp resolved -> ${BACKUP_STAMP}"

run_and_capture "DR Weekly Restore Cycle" \
  env BACKUP_STAMP="$BACKUP_STAMP" RESTORE_TARGET="$RESTORE_TARGET" bash tools/dr_weekly_restore_cycle.sh

DR_RUN_ID="$(rg '"route_or_action":"dr.weekly_restore_cycle.complete"' "$LOG_FILE" | tail -n1 | sed -E 's/.*"run_id":"([^"]+)".*/\1/' || true)"
if [[ -n "$DR_RUN_ID" ]]; then
  pass "dr run id -> ${DR_RUN_ID}"
else
  warn "dr run id could not be parsed from log"
fi

run_and_capture "Strict Full Go-Live Gate" \
  env \
    GO_LIVE_BASELINE_READINESS_STRICT="$GO_LIVE_BASELINE_READINESS_STRICT" \
    GO_LIVE_WITH_DR_CRON_SCHEDULE_CHECK="$GO_LIVE_WITH_DR_CRON_SCHEDULE_CHECK" \
    GO_LIVE_WITH_BACKUP_VERIFY="$GO_LIVE_WITH_BACKUP_VERIFY" \
    GO_LIVE_WITH_SMTP="$GO_LIVE_WITH_SMTP" \
    CREATOR_USERNAME="$CREATOR_USERNAME" \
    RESET_SMOKE_EMAIL="$RESET_SMOKE_EMAIL" \
    bash tools/go_live_gate_full.sh

GO_LIVE_RUN_ID="$(rg '"route_or_action":"go_live_gate_full.summary"' "$LOG_FILE" | tail -n1 | sed -E 's/.*"run_id":"([^"]+)".*/\1/' || true)"
GO_LIVE_SUMMARY_FILE="$(rg '^summary_file=artifacts/go-live/go-live-full-' "$LOG_FILE" | tail -n1 | cut -d= -f2- || true)"
if [[ -z "$GO_LIVE_SUMMARY_FILE" ]]; then
  GO_LIVE_SUMMARY_FILE="$(ls -1t artifacts/go-live/go-live-full-*.txt | head -n1 || true)"
fi
[[ -n "$GO_LIVE_SUMMARY_FILE" && -f "$GO_LIVE_SUMMARY_FILE" ]] || fail "could not resolve go-live full summary file"
pass "go-live summary -> ${GO_LIVE_SUMMARY_FILE}"
if [[ -n "$GO_LIVE_RUN_ID" ]]; then
  pass "go-live run id -> ${GO_LIVE_RUN_ID}"
else
  fail "could not parse go-live run id from log"
fi

TAG="checkpoint-go-live-full-pass-$(date -u +%Y%m%d-%H%M)"
TAG_MSG="Go-live full gate pass (release ops cycle automation)"
run_and_capture "Create Checkpoint Tag" git tag -a "$TAG" -m "$TAG_MSG"

if [[ "$RELEASE_CYCLE_PUSH_TAG" == "true" ]]; then
  run_and_capture "Push Checkpoint Tag" git push origin "$TAG"
else
  warn "tag push skipped (RELEASE_CYCLE_PUSH_TAG=false)"
fi

HEAD_COMMIT="$(git rev-parse --short=7 HEAD)"
run_and_capture "Auto Sync Release Docs" \
  env \
    RELEASE_DOCS_TAG="$TAG" \
    RELEASE_DOCS_FULL_SUMMARY="$GO_LIVE_SUMMARY_FILE" \
    RELEASE_DOCS_GO_LIVE_RUN_ID="$GO_LIVE_RUN_ID" \
    RELEASE_DOCS_HEAD_COMMIT="$HEAD_COMMIT" \
    bash tools/release_docs_auto_sync.sh

run_and_capture "Release Docs Sync Check" bash tools/release_docs_sync_check.sh

git add docs/GO_LIVE_GATE.md docs/RELEASE_HANDOFF.md docs/CODEX_STATUS.md
if git diff --cached --quiet; then
  warn "no docs changes to commit"
else
  DOCS_COMMIT_MSG="docs(release): sync checkpoint ${TAG#checkpoint-go-live-full-pass-} strict full pass"
  run_and_capture "Commit Release Docs" git commit -m "$DOCS_COMMIT_MSG"
  if [[ "$RELEASE_CYCLE_PUSH_DOCS" == "true" ]]; then
    run_and_capture "Push Release Docs Commit" git push
  else
    warn "docs push skipped (RELEASE_CYCLE_PUSH_DOCS=false)"
  fi
fi

echo
echo "================ RELEASE OPS CYCLE SUMMARY ================"
echo "status=PASS"
echo "backup_stamp=${BACKUP_STAMP}"
echo "restore_target=${RESTORE_TARGET}"
echo "dr_run_id=${DR_RUN_ID:-unknown}"
echo "go_live_run_id=${GO_LIVE_RUN_ID}"
echo "go_live_summary=${GO_LIVE_SUMMARY_FILE}"
echo "checkpoint_tag=${TAG}"
echo "head_commit_before_docs=${HEAD_COMMIT}"
echo "log_file=${LOG_FILE}"
echo "==========================================================="
