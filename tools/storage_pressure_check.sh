#!/usr/bin/env bash
set -euo pipefail

DISK_WARN_PERCENT="${STORAGE_DISK_WARN_PERCENT:-85}"
UPLOAD_WARN_BYTES="${STORAGE_UPLOAD_WARN_BYTES:-32212254720}"
UPLOAD_PATH_IN_CONTAINER="${STORAGE_UPLOAD_PATH:-/opt/app/public/uploads}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

[[ "$DISK_WARN_PERCENT" =~ ^[0-9]+$ ]] || fail "STORAGE_DISK_WARN_PERCENT must be integer"
[[ "$UPLOAD_WARN_BYTES" =~ ^[0-9]+$ ]] || fail "STORAGE_UPLOAD_WARN_BYTES must be integer"

root_usage="$(df -P / | awk 'NR==2{gsub(/%/,"",$5); print $5}')"
if (( root_usage > DISK_WARN_PERCENT )); then
  fail "root disk usage ${root_usage}% exceeds threshold ${DISK_WARN_PERCENT}%"
else
  pass "root disk usage ${root_usage}% within threshold"
fi

docker compose up -d strapi >/dev/null
upload_bytes="$(docker compose exec -T strapi sh -lc "du -sb '${UPLOAD_PATH_IN_CONTAINER}' | awk '{print \$1}'" 2>/dev/null || echo 0)"
if [[ ! "$upload_bytes" =~ ^[0-9]+$ ]]; then
  fail "could not resolve upload directory size"
fi

if (( upload_bytes > UPLOAD_WARN_BYTES )); then
  fail "uploads size ${upload_bytes} bytes exceeds threshold ${UPLOAD_WARN_BYTES}"
else
  pass "uploads size ${upload_bytes} bytes within threshold"
fi

echo "STORAGE PRESSURE: PASS"
