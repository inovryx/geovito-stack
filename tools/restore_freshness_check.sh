#!/usr/bin/env bash
set -euo pipefail

EVIDENCE_FILE="${RESTORE_EVIDENCE_FILE:-artifacts/dr/restore-smoke-last.json}"
MAX_DAYS="${RESTORE_FRESHNESS_MAX_DAYS:-14}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

[[ -f "$EVIDENCE_FILE" ]] || fail "restore evidence file not found: $EVIDENCE_FILE"
[[ "$MAX_DAYS" =~ ^[0-9]+$ ]] || fail "RESTORE_FRESHNESS_MAX_DAYS must be integer"

ts="$(sed -n 's/.*"smoke_at_utc"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$EVIDENCE_FILE")"
[[ -n "$ts" ]] || fail "smoke_at_utc missing in evidence"

smoke_epoch="$(date -u -d "$ts" +%s 2>/dev/null || true)"
now_epoch="$(date -u +%s)"
[[ -n "$smoke_epoch" ]] || fail "invalid smoke_at_utc timestamp: $ts"

age_days="$(( (now_epoch - smoke_epoch) / 86400 ))"
if (( age_days <= MAX_DAYS )); then
  pass "restore freshness ${age_days} day(s) <= ${MAX_DAYS}"
else
  fail "restore freshness ${age_days} day(s) > ${MAX_DAYS}"
fi

echo "RESTORE FRESHNESS: PASS"
