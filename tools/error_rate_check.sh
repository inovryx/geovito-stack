#!/usr/bin/env bash
set -euo pipefail

WINDOW_MINUTES="${ERROR_RATE_WINDOW_MINUTES:-15}"
MAX_5XX="${ERROR_RATE_MAX_5XX:-10}"
MAX_AUTH_FAIL="${ERROR_RATE_MAX_AUTH_FAIL:-25}"
MAX_MOD_FAIL="${ERROR_RATE_MAX_MOD_FAIL:-10}"
MOD_FAIL_MIN_STATUS="${ERROR_RATE_MOD_FAIL_MIN_STATUS:-500}"
LOG_DIR="${ERROR_RATE_LOG_DIR:-logs}"
OUTPUT_FILE="${ERROR_RATE_OUTPUT_FILE:-artifacts/observability/error-rate-last.json}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

[[ "$WINDOW_MINUTES" =~ ^[0-9]+$ ]] || fail "ERROR_RATE_WINDOW_MINUTES must be integer"
[[ "$MAX_5XX" =~ ^[0-9]+$ ]] || fail "ERROR_RATE_MAX_5XX must be integer"
[[ "$MAX_AUTH_FAIL" =~ ^[0-9]+$ ]] || fail "ERROR_RATE_MAX_AUTH_FAIL must be integer"
[[ "$MAX_MOD_FAIL" =~ ^[0-9]+$ ]] || fail "ERROR_RATE_MAX_MOD_FAIL must be integer"
[[ "$MOD_FAIL_MIN_STATUS" =~ ^[0-9]+$ ]] || fail "ERROR_RATE_MOD_FAIL_MIN_STATUS must be integer"
(( MOD_FAIL_MIN_STATUS >= 400 && MOD_FAIL_MIN_STATUS <= 599 )) || fail "ERROR_RATE_MOD_FAIL_MIN_STATUS must be between 400 and 599"
[[ -d "$LOG_DIR" ]] || fail "log directory not found: $LOG_DIR"

mkdir -p "$(dirname "$OUTPUT_FILE")"
tmp_output="$(mktemp)"

if command -v node >/dev/null 2>&1; then
  runner=(node -)
else
  command -v docker >/dev/null 2>&1 || fail "node or docker is required"
  runner=(docker run --rm -i -v "$PWD":/work -w /work node:20-alpine node -)
fi

set +e
"${runner[@]}" "$LOG_DIR" "$WINDOW_MINUTES" "$MAX_5XX" "$MAX_AUTH_FAIL" "$MAX_MOD_FAIL" "$MOD_FAIL_MIN_STATUS" <<'NODE' >"$tmp_output"
const fs = require('fs');
const path = require('path');

const [logDir, windowMinutesRaw, max5xxRaw, maxAuthRaw, maxModRaw, modFailMinStatusRaw] = process.argv.slice(2);
const windowMinutes = Number(windowMinutesRaw);
const max5xx = Number(max5xxRaw);
const maxAuth = Number(maxAuthRaw);
const maxMod = Number(maxModRaw);
const modFailMinStatus = Number(modFailMinStatusRaw);

const now = Date.now();
const windowStart = now - windowMinutes * 60 * 1000;

const authPaths = new Set(['/api/auth/local', '/api/auth/forgot-password', '/api/auth/reset-password']);
const moderationPathHints = ['/api/content-reports/moderation', '/api/blog-comments/moderation', '/api/blog-posts/moderation', '/api/account-requests/moderation'];

let count5xx = 0;
let countAuthFail = 0;
let countModFail = 0;

const walk = (dir) => {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      out.push(full);
    }
  }
  return out;
};

for (const file of walk(logDir)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }

    const ts = Date.parse(String(row.ts || ''));
    if (!Number.isFinite(ts) || ts < windowStart) continue;

    const status = Number(row?.meta?.status || 0);
    const p = String(row?.meta?.path || '');

    if (status >= 500) count5xx += 1;
    if ((status === 401 || status === 403) && authPaths.has(p)) countAuthFail += 1;
    if (status >= modFailMinStatus && moderationPathHints.some((hint) => p.includes(hint))) countModFail += 1;
  }
}

const result = {
  window_minutes: windowMinutes,
  mod_fail_min_status: modFailMinStatus,
  count_5xx: count5xx,
  count_auth_fail: countAuthFail,
  count_moderation_fail: countModFail,
};

console.log(`JSON_OUTPUT:${JSON.stringify(result)}`);

if (count5xx > max5xx || countAuthFail > maxAuth || countModFail > maxMod) {
  process.exit(2);
}
NODE
status=$?
set -e

json_line="$(sed -n 's/^JSON_OUTPUT://p' "$tmp_output" | tail -n 1)"
[[ -n "$json_line" ]] || fail "error-rate parser did not emit JSON_OUTPUT"
printf '%s\n' "$json_line" > "$OUTPUT_FILE"
rm -f "$tmp_output"

if [[ $status -eq 0 ]]; then
  pass "error-rate thresholds are within limits"
  pass "report written -> ${OUTPUT_FILE}"
else
  fail "error-rate thresholds exceeded (see ${OUTPUT_FILE})"
fi
