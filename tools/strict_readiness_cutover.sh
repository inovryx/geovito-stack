#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CUTOFF_DATE_UTC="${STRICT_CUTOVER_DATE_UTC:-2026-03-14}"
ALLOW_EARLY_CUTOVER="${ALLOW_EARLY_CUTOVER:-false}"
RESET_SMOKE_EMAIL="${RESET_SMOKE_EMAIL:-${EMAIL_SMOKE_TO:-}}"
GO_LIVE_WITH_BACKUP_VERIFY="${GO_LIVE_WITH_BACKUP_VERIFY:-true}"
GO_LIVE_WITH_SMTP="${GO_LIVE_WITH_SMTP:-true}"
CREATOR_USERNAME="${CREATOR_USERNAME:-}"

pass() { echo "PASS: $1"; }
warn() { echo "WARN: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

[[ -n "$RESET_SMOKE_EMAIL" ]] || fail "RESET_SMOKE_EMAIL (or EMAIL_SMOKE_TO) is required"

TODAY_UTC="$(date -u +%F)"
if [[ "$ALLOW_EARLY_CUTOVER" != "true" && "$TODAY_UTC" < "$CUTOFF_DATE_UTC" ]]; then
  fail "strict cutover blocked before ${CUTOFF_DATE_UTC} UTC (today=${TODAY_UTC}); set ALLOW_EARLY_CUTOVER=true to bypass"
fi

cat <<INFO
==============================================================
GEOVITO STRICT READINESS CUTOVER
==============================================================
root_dir=${ROOT_DIR}
cutoff_date_utc=${CUTOFF_DATE_UTC}
allow_early_cutover=${ALLOW_EARLY_CUTOVER}
reset_smoke_email=${RESET_SMOKE_EMAIL}
with_backup_verify=${GO_LIVE_WITH_BACKUP_VERIFY}
with_smtp=${GO_LIVE_WITH_SMTP}
creator_username=${CREATOR_USERNAME}
==============================================================
INFO

pass "cutover date gate satisfied"

# Always refresh readiness report before strict full gate.
pass "refreshing baseline readiness report"
bash tools/observability_baseline_readiness.sh

pass "running strict full go-live gate"
GO_LIVE_BASELINE_READINESS_STRICT=true \
GO_LIVE_WITH_BACKUP_VERIFY="$GO_LIVE_WITH_BACKUP_VERIFY" \
GO_LIVE_WITH_SMTP="$GO_LIVE_WITH_SMTP" \
CREATOR_USERNAME="$CREATOR_USERNAME" \
RESET_SMOKE_EMAIL="$RESET_SMOKE_EMAIL" \
bash tools/go_live_gate_full.sh

pass "strict cutover run completed"
warn "if full gate is PASS, create and push a checkpoint tag immediately"
