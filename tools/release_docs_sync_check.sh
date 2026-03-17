#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GO_LIVE_DOC="docs/GO_LIVE_GATE.md"
HANDOFF_DOC="docs/RELEASE_HANDOFF.md"
STATUS_DOC="docs/CODEX_STATUS.md"
OUTPUT_FILE="${RELEASE_DOCS_SYNC_OUTPUT_FILE:-artifacts/release/docs-sync-last.json}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

[[ -f "$GO_LIVE_DOC" ]] || fail "missing file: ${GO_LIVE_DOC}"
[[ -f "$HANDOFF_DOC" ]] || fail "missing file: ${HANDOFF_DOC}"
[[ -f "$STATUS_DOC" ]] || fail "missing file: ${STATUS_DOC}"

latest_tag="$(git tag --list 'checkpoint-go-live-full-pass-*' | tail -n 1)"
[[ -n "$latest_tag" ]] || fail "no checkpoint-go-live-full-pass tags found"

extract_backtick_value() {
  local pattern="$1"
  local file="$2"
  local value
  value="$(rg -n "$pattern" "$file" | head -n 1 | sed -E 's/^.*`([^`]+)`.*$/\1/' || true)"
  echo "$value"
}

go_live_tag="$(extract_backtick_value '^- Tag: `' "$GO_LIVE_DOC")"
[[ -n "$go_live_tag" ]] || fail "could not parse latest stable checkpoint tag from ${GO_LIVE_DOC}"

handoff_sync_tag="$(extract_backtick_value '^- Latest checkpoint tag \(post-pass docs sync\): `' "$HANDOFF_DOC")"
[[ -n "$handoff_sync_tag" ]] || fail "could not parse post-pass docs sync tag from ${HANDOFF_DOC}"

handoff_strict_tag="$(extract_backtick_value '^- Latest strict full-pass checkpoint tag: `' "$HANDOFF_DOC")"
[[ -n "$handoff_strict_tag" ]] || fail "could not parse strict full-pass checkpoint tag from ${HANDOFF_DOC}"

git rev-parse -q --verify "refs/tags/${go_live_tag}" >/dev/null || fail "GO_LIVE_GATE tag not found in git: ${go_live_tag}"
git rev-parse -q --verify "refs/tags/${handoff_sync_tag}" >/dev/null || fail "RELEASE_HANDOFF sync tag not found in git: ${handoff_sync_tag}"
git rev-parse -q --verify "refs/tags/${handoff_strict_tag}" >/dev/null || fail "RELEASE_HANDOFF strict tag not found in git: ${handoff_strict_tag}"

[[ "$go_live_tag" == "$handoff_sync_tag" ]] || fail "GO_LIVE_GATE tag (${go_live_tag}) != RELEASE_HANDOFF sync tag (${handoff_sync_tag})"
[[ "$handoff_sync_tag" == "$latest_tag" ]] || fail "RELEASE_HANDOFF sync tag (${handoff_sync_tag}) != latest git checkpoint tag (${latest_tag})"

printf -v status_tag_pattern -- '- `%s`' "$latest_tag"
if ! rg -q --fixed-strings -- "$status_tag_pattern" "$STATUS_DOC"; then
  fail "CODEX_STATUS recent checkpoint list missing latest tag (${latest_tag})"
fi

mkdir -p "$(dirname "$OUTPUT_FILE")"

report_json="$(
  if command -v node >/dev/null 2>&1; then
    node - "$latest_tag" "$go_live_tag" "$handoff_sync_tag" "$handoff_strict_tag" <<'NODE'
const [latestTag, goLiveTag, handoffSyncTag, handoffStrictTag] = process.argv.slice(2);
const payload = {
  measured_at: new Date().toISOString(),
  status: "pass",
  latest_git_checkpoint_tag: latestTag,
  go_live_gate_tag: goLiveTag,
  release_handoff_sync_tag: handoffSyncTag,
  release_handoff_strict_tag: handoffStrictTag,
};
process.stdout.write(JSON.stringify(payload));
NODE
  else
    docker run --rm -i -v "$PWD":/work -w /work node:20-alpine node - "$latest_tag" "$go_live_tag" "$handoff_sync_tag" "$handoff_strict_tag" <<'NODE'
const [latestTag, goLiveTag, handoffSyncTag, handoffStrictTag] = process.argv.slice(2);
const payload = {
  measured_at: new Date().toISOString(),
  status: "pass",
  latest_git_checkpoint_tag: latestTag,
  go_live_gate_tag: goLiveTag,
  release_handoff_sync_tag: handoffSyncTag,
  release_handoff_strict_tag: handoffStrictTag,
};
process.stdout.write(JSON.stringify(payload));
NODE
  fi
)"
printf '%s\n' "$report_json" > "$OUTPUT_FILE"

pass "GO_LIVE_GATE stable tag matches RELEASE_HANDOFF sync tag"
pass "RELEASE_HANDOFF sync tag matches latest git checkpoint tag"
pass "CODEX_STATUS includes latest checkpoint tag"
pass "report written -> ${OUTPUT_FILE}"
echo "RELEASE DOCS SYNC CHECK: PASS"
