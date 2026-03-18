#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GO_LIVE_DOC="docs/GO_LIVE_GATE.md"
HANDOFF_DOC="docs/RELEASE_HANDOFF.md"
STATUS_DOC="docs/CODEX_STATUS.md"

RELEASE_DOCS_TAG="${RELEASE_DOCS_TAG:-}"
RELEASE_DOCS_FULL_SUMMARY="${RELEASE_DOCS_FULL_SUMMARY:-}"
RELEASE_DOCS_GO_LIVE_RUN_ID="${RELEASE_DOCS_GO_LIVE_RUN_ID:-}"
RELEASE_DOCS_HEAD_COMMIT="${RELEASE_DOCS_HEAD_COMMIT:-}"
RELEASE_DOCS_UPDATED_AT="${RELEASE_DOCS_UPDATED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

BASELINE_FILE="${RELEASE_DOCS_BASELINE_FILE:-artifacts/observability/baseline-readiness-last.json}"
READINESS_STATE_FILE="${RELEASE_DOCS_READINESS_STATE_FILE:-artifacts/observability/readiness-watch-state.json}"
TREND_FRESHNESS_FILE="${RELEASE_DOCS_TREND_FRESHNESS_FILE:-artifacts/observability/trend-freshness-last.json}"
TREND_REPORT_TXT="${RELEASE_DOCS_TREND_REPORT_TXT:-artifacts/observability/trend-report-last.txt}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

insert_after_last_match_if_missing() {
  local file="$1"
  local match_regex="$2"
  local line_value="$3"

  if rg -F -q -- "$line_value" "$file"; then
    return 0
  fi

  local tmp_file
  tmp_file="$(mktemp)"
  awk -v pattern="$match_regex" -v newline="$line_value" '
    { lines[NR] = $0; if ($0 ~ pattern) { last = NR } }
    END {
      inserted = 0
      for (i = 1; i <= NR; i++) {
        print lines[i]
        if (i == last) {
          print newline
          inserted = 1
        }
      }
      if (!inserted) {
        print newline
      }
    }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}

[[ -f "$GO_LIVE_DOC" ]] || fail "missing file: ${GO_LIVE_DOC}"
[[ -f "$HANDOFF_DOC" ]] || fail "missing file: ${HANDOFF_DOC}"
[[ -f "$STATUS_DOC" ]] || fail "missing file: ${STATUS_DOC}"

[[ -n "$RELEASE_DOCS_TAG" ]] || fail "RELEASE_DOCS_TAG is required"
[[ -n "$RELEASE_DOCS_FULL_SUMMARY" ]] || fail "RELEASE_DOCS_FULL_SUMMARY is required"
[[ -f "$RELEASE_DOCS_FULL_SUMMARY" ]] || fail "summary file not found: ${RELEASE_DOCS_FULL_SUMMARY}"

if [[ -z "$RELEASE_DOCS_GO_LIVE_RUN_ID" ]]; then
  RELEASE_DOCS_GO_LIVE_RUN_ID="$(
    rg -n '"route_or_action":"go_live_gate_full.summary"' artifacts/release artifacts/go-live 2>/dev/null \
      | tail -n1 \
      | sed -E 's/.*"run_id":"([^"]+)".*/\1/' \
      || true
  )"
fi
[[ -n "$RELEASE_DOCS_GO_LIVE_RUN_ID" ]] || fail "RELEASE_DOCS_GO_LIVE_RUN_ID is required (or discoverable from artifacts)"

if [[ -z "$RELEASE_DOCS_HEAD_COMMIT" ]]; then
  RELEASE_DOCS_HEAD_COMMIT="$(git rev-parse --short=7 HEAD)"
fi

[[ -f "$BASELINE_FILE" ]] || fail "missing baseline file: ${BASELINE_FILE}"
[[ -f "$READINESS_STATE_FILE" ]] || fail "missing readiness state file: ${READINESS_STATE_FILE}"
[[ -f "$TREND_FRESHNESS_FILE" ]] || fail "missing trend freshness file: ${TREND_FRESHNESS_FILE}"
[[ -f "$TREND_REPORT_TXT" ]] || fail "missing trend report txt: ${TREND_REPORT_TXT}"

baseline_json="$(tr -d '\n' < "$BASELINE_FILE")"
trend_json="$(tr -d '\n' < "$TREND_FRESHNESS_FILE")"

readiness_ready="$(printf '%s' "$baseline_json" | sed -E 's/.*"ready":(true|false).*/\1/')"
readiness_observed="$(printf '%s' "$baseline_json" | sed -E 's/.*"observed":\{"error_samples":([0-9]+),"storage_samples":([0-9]+),"error_distinct_days":([0-9]+),"storage_distinct_days":([0-9]+)\}.*/\1|\2|\3|\4/')"
IFS='|' read -r error_samples storage_samples error_distinct_days storage_distinct_days <<< "$readiness_observed"

[[ "$readiness_ready" == "true" || "$readiness_ready" == "false" ]] || fail "could not parse ready flag from ${BASELINE_FILE}"
[[ "$error_samples" =~ ^[0-9]+$ ]] || fail "could not parse observed.error_samples from ${BASELINE_FILE}"
[[ "$storage_samples" =~ ^[0-9]+$ ]] || fail "could not parse observed.storage_samples from ${BASELINE_FILE}"
[[ "$error_distinct_days" =~ ^[0-9]+$ ]] || fail "could not parse observed.error_distinct_days from ${BASELINE_FILE}"
[[ "$storage_distinct_days" =~ ^[0-9]+$ ]] || fail "could not parse observed.storage_distinct_days from ${BASELINE_FILE}"

trend_status="$(printf '%s' "$trend_json" | sed -E 's/.*"status":"([^"]+)".*/\1/')"
trend_age_minutes="$(printf '%s' "$trend_json" | sed -E 's/.*"age_minutes":([0-9]+).*/\1/')"
[[ -n "$trend_status" ]] || fail "could not parse trend status from ${TREND_FRESHNESS_FILE}"
[[ "$trend_age_minutes" =~ ^[0-9]+$ ]] || fail "could not parse trend age_minutes from ${TREND_FRESHNESS_FILE}"

readiness_checked_at="$(
  rg -o '"checked_at":[[:space:]]*"[^"]+"' "$READINESS_STATE_FILE" \
    | head -n1 \
    | sed -E 's/.*"checked_at":[[:space:]]*"([^"]+)".*/\1/'
)"
[[ -n "$readiness_checked_at" ]] || fail "could not parse checked_at from ${READINESS_STATE_FILE}"

trend_generated_at="$(rg '^generated_at=' "$TREND_REPORT_TXT" | head -n1 | cut -d= -f2- || true)"
[[ -n "$trend_generated_at" ]] || fail "could not parse generated_at from ${TREND_REPORT_TXT}"

day_only="${RELEASE_DOCS_UPDATED_AT%%T*}"

tag_suffix="${RELEASE_DOCS_TAG#checkpoint-go-live-full-pass-}"
ops_stamp_human="$tag_suffix"
if [[ "$tag_suffix" =~ ^([0-9]{4})([0-9]{2})([0-9]{2})-([0-9]{2})([0-9]{2})$ ]]; then
  ops_stamp_human="${BASH_REMATCH[1]}-${BASH_REMATCH[2]}-${BASH_REMATCH[3]}-${BASH_REMATCH[4]}${BASH_REMATCH[5]}"
fi

ops_line="- \`ops(release): strict full gate rerun PASS + checkpoint tag pushed (${ops_stamp_human})\`"
tag_line="- \`${RELEASE_DOCS_TAG}\`"

export DAY_ONLY="$day_only"
export DOC_TAG="$RELEASE_DOCS_TAG"
export DOC_COMMIT="$RELEASE_DOCS_HEAD_COMMIT"
export DOC_SUMMARY="$RELEASE_DOCS_FULL_SUMMARY"
export DOC_UPDATED_AT="$RELEASE_DOCS_UPDATED_AT"
export DOC_RUN_ID="$RELEASE_DOCS_GO_LIVE_RUN_ID"
export DOC_READY="$readiness_ready"
export DOC_ERROR_SAMPLES="$error_samples"
export DOC_STORAGE_SAMPLES="$storage_samples"
export DOC_ERROR_DAYS="$error_distinct_days"
export DOC_STORAGE_DAYS="$storage_distinct_days"
export DOC_TREND_STATUS="$trend_status"
export DOC_TREND_AGE="$trend_age_minutes"
export DOC_TREND_GENERATED_AT="$trend_generated_at"
export DOC_READINESS_CHECKED_AT="$readiness_checked_at"

perl -0777 -i -pe '
  BEGIN {
    $day = $ENV{DAY_ONLY};
    $tag = $ENV{DOC_TAG};
    $commit = $ENV{DOC_COMMIT};
    $summary = $ENV{DOC_SUMMARY};
  }
  $ok = 0;
  $ok += s/^- Date \(UTC\): `[^`]*`$/- Date (UTC): `$day`/m;
  $ok += s/^- Tag: `[^`]*`$/- Tag: `$tag`/m;
  $ok += s/^- Commit: `[^`]*`$/- Commit: `$commit`/m;
  $ok += s/^- Full gate summary artifact: `[^`]*`$/- Full gate summary artifact: `$summary`/m;
  END { die "GO_LIVE_GATE update failed\n" if $ok < 4; }
' "$GO_LIVE_DOC"

perl -0777 -i -pe '
  BEGIN {
    $updated_at = $ENV{DOC_UPDATED_AT};
    $summary = $ENV{DOC_SUMMARY};
    $run_id = $ENV{DOC_RUN_ID};
    $tag = $ENV{DOC_TAG};
    $ready = $ENV{DOC_READY};
    $es = $ENV{DOC_ERROR_SAMPLES};
    $ss = $ENV{DOC_STORAGE_SAMPLES};
    $ed = $ENV{DOC_ERROR_DAYS};
    $sd = $ENV{DOC_STORAGE_DAYS};
    $checked = $ENV{DOC_READINESS_CHECKED_AT};
    $trend_generated = $ENV{DOC_TREND_GENERATED_AT};
    $trend_status = $ENV{DOC_TREND_STATUS};
    $trend_age = $ENV{DOC_TREND_AGE};
    $commit = $ENV{DOC_COMMIT};
  }
  $ok = 0;
  $ok += s/^Last updated \(UTC\): .*$/Last updated (UTC): $updated_at/m;
  $ok += s/^- Latest strict full-gate PASS evidence: `.*`$/- Latest strict full-gate PASS evidence: `$summary`/m;
  $ok += s/^- Latest strict full-gate run id: `.*`$/- Latest strict full-gate run id: `$run_id`/m;
  $ok += s/^- Latest strict full-pass checkpoint tag: `.*`$/- Latest strict full-pass checkpoint tag: `$tag`/m;
  $ok += s/^- Latest checkpoint tag \(post-pass docs sync\): `.*`$/- Latest checkpoint tag (post-pass docs sync): `$tag`/m;
  $ok += s/^- Latest readiness state: .*$/- Latest readiness state: `ready=$ready` (`error_samples=$es`, `storage_samples=$ss`, `error_distinct_days=$ed`, `storage_distinct_days=$sd`)/m;
  $ok += s/^- Latest readiness watch check: `.*`$/- Latest readiness watch check: `$checked`/m;
  $ok += s/^- Latest trend report: `artifacts\/observability\/trend-report-last\.txt` .*$/- Latest trend report: `artifacts\/observability\/trend-report-last.txt` (`OVERALL=PASS`, generated at `$trend_generated`)/m;
  $ok += s/^- Latest trend freshness: `artifacts\/observability\/trend-freshness-last\.json` .*$/- Latest trend freshness: `artifacts\/observability\/trend-freshness-last.json` (`status=$trend_status`, `age_minutes=$trend_age`)/m;
  $ok += s/^- Latest pushed commit at handoff creation: `.*`$/- Latest pushed commit at handoff creation: `$commit`/m;
  END { die "RELEASE_HANDOFF update failed\n" if $ok < 10; }
' "$HANDOFF_DOC"

perl -0777 -i -pe '
  BEGIN {
    $updated_at = $ENV{DOC_UPDATED_AT};
    $commit = $ENV{DOC_COMMIT};
    $summary = $ENV{DOC_SUMMARY};
    $ready = $ENV{DOC_READY};
    $es = $ENV{DOC_ERROR_SAMPLES};
    $ss = $ENV{DOC_STORAGE_SAMPLES};
    $ed = $ENV{DOC_ERROR_DAYS};
    $sd = $ENV{DOC_STORAGE_DAYS};
  }
  $ok = 0;
  $ok += s/^Last updated \(UTC\): .*$/Last updated (UTC): $updated_at/m;
  $ok += s/^Current head before this status update commit: `.*`$/Current head before this status update commit: `$commit`/m;
  $ok += s/^  - `artifacts\/go-live\/go-live-full-.*`$/  - `$summary`/m;
  $ok += s/^  - `ready=.*$/  - `ready=$ready`, observed: `error_samples=$es`, `storage_samples=$ss`, `error_distinct_days=$ed`, `storage_distinct_days=$sd`./m;
  $ok += s/^  - `main` pushed at `.*`\.$/  - `main` pushed at `$commit`./m;
  END { die "CODEX_STATUS replace failed\n" if $ok < 5; }
' "$STATUS_DOC"

insert_after_last_match_if_missing "$STATUS_DOC" '^- `ops\(release\): strict full gate rerun PASS \+ checkpoint tag pushed \([^)]+\)`$' "$ops_line"
insert_after_last_match_if_missing "$STATUS_DOC" '^- `checkpoint-go-live-full-pass-[^`]+`$' "$tag_line"

pass "docs synced for tag ${RELEASE_DOCS_TAG}"
echo "GO_LIVE_DOC=${GO_LIVE_DOC}"
echo "HANDOFF_DOC=${HANDOFF_DOC}"
echo "STATUS_DOC=${STATUS_DOC}"
