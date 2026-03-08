#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_THRESHOLD_FILE="${ROOT_DIR}/artifacts/observability/thresholds.env"
THRESHOLD_FILE="${OBSERVABILITY_THRESHOLD_FILE:-}"
if [[ -z "$THRESHOLD_FILE" && -f "$DEFAULT_THRESHOLD_FILE" ]]; then
  THRESHOLD_FILE="$DEFAULT_THRESHOLD_FILE"
fi
if [[ -n "$THRESHOLD_FILE" ]]; then
  [[ -f "$THRESHOLD_FILE" ]] || { echo "FAIL: threshold file not found: $THRESHOLD_FILE"; exit 1; }
  # shellcheck disable=SC1090
  source "$THRESHOLD_FILE"
fi

DISK_WARN_PERCENT="${STORAGE_DISK_WARN_PERCENT:-85}"
UPLOAD_WARN_BYTES="${STORAGE_UPLOAD_WARN_BYTES:-32212254720}"
UPLOAD_PATH_IN_CONTAINER="${STORAGE_UPLOAD_PATH:-/opt/app/public/uploads}"
OUTPUT_FILE="${STORAGE_OUTPUT_FILE:-artifacts/observability/storage-pressure-last.json}"
HISTORY_FILE="${STORAGE_HISTORY_FILE:-artifacts/observability/storage-pressure-history.jsonl}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

[[ "$DISK_WARN_PERCENT" =~ ^[0-9]+$ ]] || fail "STORAGE_DISK_WARN_PERCENT must be integer"
[[ "$UPLOAD_WARN_BYTES" =~ ^[0-9]+$ ]] || fail "STORAGE_UPLOAD_WARN_BYTES must be integer"
mkdir -p "$(dirname "$OUTPUT_FILE")"
mkdir -p "$(dirname "$HISTORY_FILE")"

if command -v node >/dev/null 2>&1; then
  json_runner=(node -)
else
  command -v docker >/dev/null 2>&1 || fail "node or docker is required"
  json_runner=(docker run --rm -i -v "$PWD":/work -w /work node:20-alpine node -)
fi

root_usage="$(df -P / | awk 'NR==2{gsub(/%/,"",$5); print $5}')"
disk_threshold_ok="true"
if (( root_usage > DISK_WARN_PERCENT )); then
  disk_threshold_ok="false"
  echo "FAIL: root disk usage ${root_usage}% exceeds threshold ${DISK_WARN_PERCENT}%"
else
  pass "root disk usage ${root_usage}% within threshold"
fi

docker compose up -d strapi >/dev/null
upload_bytes="$(docker compose exec -T strapi sh -lc "du -sb '${UPLOAD_PATH_IN_CONTAINER}' | awk '{print \$1}'" 2>/dev/null || echo 0)"
if [[ ! "$upload_bytes" =~ ^[0-9]+$ ]]; then
  fail "could not resolve upload directory size"
fi

upload_threshold_ok="true"
if (( upload_bytes > UPLOAD_WARN_BYTES )); then
  upload_threshold_ok="false"
  echo "FAIL: uploads size ${upload_bytes} bytes exceeds threshold ${UPLOAD_WARN_BYTES}"
else
  pass "uploads size ${upload_bytes} bytes within threshold"
fi

report_json="$(
  "${json_runner[@]}" "$root_usage" "$DISK_WARN_PERCENT" "$upload_bytes" "$UPLOAD_WARN_BYTES" "$UPLOAD_PATH_IN_CONTAINER" <<'NODE'
const [diskUsage, diskWarn, uploadBytes, uploadWarn, uploadPath] = process.argv.slice(2);
const payload = {
  measured_at: new Date().toISOString(),
  disk_usage_percent: Number(diskUsage),
  disk_warn_percent: Number(diskWarn),
  upload_bytes: Number(uploadBytes),
  upload_warn_bytes: Number(uploadWarn),
  upload_path: uploadPath || "",
};
process.stdout.write(JSON.stringify(payload));
NODE
)"
printf '%s\n' "$report_json" > "$OUTPUT_FILE"
printf '%s\n' "$report_json" >> "$HISTORY_FILE"
pass "report written -> ${OUTPUT_FILE}"
pass "history appended -> ${HISTORY_FILE}"

if [[ "$disk_threshold_ok" != "true" || "$upload_threshold_ok" != "true" ]]; then
  fail "storage pressure threshold exceeded (see ${OUTPUT_FILE})"
fi

echo "STORAGE PRESSURE: PASS"
