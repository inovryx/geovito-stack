#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/tools/lib_log_contract.sh"
gv_log_contract_init "scripts"

LOG_CONTRACT_FILE_ROOT="${LOG_CONTRACT_FILE_ROOT:-$ROOT_DIR/logs/channels}"
API_BASE="${API_BASE:-http://127.0.0.1:1337}"
SMOKE_SCOPE="${LOG_CONTRACT_SMOKE_SCOPE:-log-contract-smoke}"
REQUEST_ID="${LOG_CONTRACT_REQUEST_ID:-gv-${SMOKE_SCOPE}-$(date -u +%Y%m%d%H%M%S)-$RANDOM}"
SCRIPT_REQUEST_ID="${REQUEST_ID}-script"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

echo "=============================================================="
echo "GEOVITO LOG CONTRACT SMOKE"
echo "API_BASE=${API_BASE}"
echo "LOG_CONTRACT_FILE_ROOT=${LOG_CONTRACT_FILE_ROOT}"
echo "REQUEST_ID=${REQUEST_ID}"
echo "SCRIPT_REQUEST_ID=${SCRIPT_REQUEST_ID}"
echo "=============================================================="

docker compose up -d strapi >/dev/null

code=""
for _ in $(seq 1 40); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "${API_BASE}/admin" -H "X-Request-Id: ${REQUEST_ID}" || true)"
  if [[ "$code" == "200" || "$code" == "302" || "$code" == "401" || "$code" == "403" ]]; then
    break
  fi
  sleep 1
done

if [[ "$code" != "200" && "$code" != "302" && "$code" != "401" && "$code" != "403" ]]; then
  fail "request trigger failed status=${code}"
fi
pass "request trigger status=${code}"

gv_log_contract_emit \
  "release" \
  "info" \
  "script redaction probe bearer token-12345 password=unsafe" \
  "log_contract_smoke.script_probe" \
  200 \
  9 \
  "token=unsafe123;guest_email=guest@example.com;reporter_email=reporter@example.com;note=owner@example.com;api_key=abc123" \
  "$SCRIPT_REQUEST_ID"
pass "script probe emitted"

sleep 1

all_file="${LOG_CONTRACT_FILE_ROOT}/all.jsonl"
[[ -f "$all_file" ]] || fail "contract log file not found: $all_file"
pass "contract log file exists"

tmp_result="$(mktemp)"
all_file_arg="$all_file"

if command -v node >/dev/null 2>&1; then
  runner=(node -)
else
  runner=(docker run --rm -i -v "$PWD":/work -w /work node:20-alpine node -)
  all_file_arg="/work/${all_file#$PWD/}"
fi

set +e
"${runner[@]}" "$all_file_arg" "$REQUEST_ID" "strapi" "backend" <<'NODE' > "$tmp_result"
const fs = require('fs');

const [filePath, requestId, expectedService, rowLabel] = process.argv.slice(2);
const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
const allowedChannels = new Set(['app', 'security', 'moderation', 'audit', 'release', 'dr']);

let target = null;
for (let i = lines.length - 1; i >= 0; i -= 1) {
  try {
    const row = JSON.parse(lines[i]);
    if (String(row?.request_id || '') === requestId) {
      target = row;
      break;
    }
  } catch {
    // ignore malformed lines
  }
}

if (!target) {
  console.log(`FAIL: ${rowLabel} request_id not found in contract logs`);
  process.exit(2);
}

const requiredKeys = ['ts', 'env', 'channel', 'level', 'msg', 'request_id', 'service', 'route_or_action', 'status', 'latency_ms', 'user_ref', 'meta'];
for (const key of requiredKeys) {
  if (!(key in target)) {
    console.log(`FAIL: ${rowLabel} missing key ${key}`);
    process.exit(3);
  }
}

if (!allowedChannels.has(String(target.channel || ''))) {
  console.log(`FAIL: ${rowLabel} invalid channel ${String(target.channel || '')}`);
  process.exit(4);
}

if (typeof target.meta !== 'object' || target.meta === null || Array.isArray(target.meta)) {
  console.log(`FAIL: ${rowLabel} meta must be object`);
  process.exit(5);
}

if (expectedService && String(target.service || '') !== expectedService) {
  console.log(`FAIL: ${rowLabel} service mismatch expected=${expectedService} got=${String(target.service || '')}`);
  process.exit(6);
}

const rawLine = JSON.stringify(target);
if (/bearer\s+[a-z0-9._~+\/=\-]+/i.test(rawLine)) {
  console.log(`FAIL: ${rowLabel} bearer token pattern leaked`);
  process.exit(7);
}
if (/"(authorization|cookie|password|token|secret|api[_-]?key|jwt)"\s*:\s*"(?!\[REDACTED\])/i.test(rawLine)) {
  console.log(`FAIL: ${rowLabel} sensitive key leaked`);
  process.exit(8);
}
if (/"(guest[_-]?email|reporter[_-]?email)"\s*:/i.test(rawLine)) {
  console.log(`FAIL: ${rowLabel} guest email key leaked`);
  process.exit(9);
}
if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(rawLine)) {
  console.log(`FAIL: ${rowLabel} full ipv4 leaked`);
  process.exit(10);
}

if (rowLabel === 'script') {
  const detail = String(target?.meta?.detail || '');
  if (/guest[_-]?email|reporter[_-]?email/i.test(detail)) {
    console.log('FAIL: script row detail still includes guest/reporter email keys');
    process.exit(11);
  }
  if (/owner@example\.com/i.test(rawLine)) {
    console.log('FAIL: script row contains unredacted email');
    process.exit(12);
  }
  if (!/\[REDACTED\]/i.test(rawLine)) {
    console.log('FAIL: script row expected redacted marker not found');
    process.exit(13);
  }
}

console.log(`PASS: ${rowLabel} contract row found channel=${target.channel} level=${target.level}`);
NODE
status=$?
set -e

cat "$tmp_result"
rm -f "$tmp_result"

[[ $status -eq 0 ]] || exit $status

tmp_result="$(mktemp)"
set +e
"${runner[@]}" "$all_file_arg" "$SCRIPT_REQUEST_ID" "scripts" "script" <<'NODE' > "$tmp_result"
const fs = require('fs');

const [filePath, requestId, expectedService, rowLabel] = process.argv.slice(2);
const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
const allowedChannels = new Set(['app', 'security', 'moderation', 'audit', 'release', 'dr']);

let target = null;
for (let i = lines.length - 1; i >= 0; i -= 1) {
  try {
    const row = JSON.parse(lines[i]);
    if (String(row?.request_id || '') === requestId) {
      target = row;
      break;
    }
  } catch {
    // ignore malformed lines
  }
}

if (!target) {
  console.log(`FAIL: ${rowLabel} request_id not found in contract logs`);
  process.exit(2);
}

const requiredKeys = ['ts', 'env', 'channel', 'level', 'msg', 'request_id', 'service', 'route_or_action', 'status', 'latency_ms', 'user_ref', 'meta'];
for (const key of requiredKeys) {
  if (!(key in target)) {
    console.log(`FAIL: ${rowLabel} missing key ${key}`);
    process.exit(3);
  }
}

if (!allowedChannels.has(String(target.channel || ''))) {
  console.log(`FAIL: ${rowLabel} invalid channel ${String(target.channel || '')}`);
  process.exit(4);
}

if (typeof target.meta !== 'object' || target.meta === null || Array.isArray(target.meta)) {
  console.log(`FAIL: ${rowLabel} meta must be object`);
  process.exit(5);
}

if (expectedService && String(target.service || '') !== expectedService) {
  console.log(`FAIL: ${rowLabel} service mismatch expected=${expectedService} got=${String(target.service || '')}`);
  process.exit(6);
}

const rawLine = JSON.stringify(target);
if (/bearer\s+[a-z0-9._~+\/=\-]+/i.test(rawLine)) {
  console.log(`FAIL: ${rowLabel} bearer token pattern leaked`);
  process.exit(7);
}
if (/"(authorization|cookie|password|token|secret|api[_-]?key|jwt)"\s*:\s*"(?!\[REDACTED\])/i.test(rawLine)) {
  console.log(`FAIL: ${rowLabel} sensitive key leaked`);
  process.exit(8);
}
if (/"(guest[_-]?email|reporter[_-]?email)"\s*:/i.test(rawLine)) {
  console.log(`FAIL: ${rowLabel} guest email key leaked`);
  process.exit(9);
}
if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(rawLine)) {
  console.log(`FAIL: ${rowLabel} full ipv4 leaked`);
  process.exit(10);
}

const detail = String(target?.meta?.detail || '');
if (/guest[_-]?email|reporter[_-]?email/i.test(detail)) {
  console.log('FAIL: script row detail still includes guest/reporter email keys');
  process.exit(11);
}
if (/owner@example\.com/i.test(rawLine)) {
  console.log('FAIL: script row contains unredacted email');
  process.exit(12);
}
if (!/\[REDACTED\]/i.test(rawLine)) {
  console.log('FAIL: script row expected redacted marker not found');
  process.exit(13);
}

console.log(`PASS: ${rowLabel} contract row found channel=${target.channel} level=${target.level}`);
NODE
status=$?
set -e

cat "$tmp_result"
rm -f "$tmp_result"

[[ $status -eq 0 ]] || exit $status

pass "log contract smoke passed"
