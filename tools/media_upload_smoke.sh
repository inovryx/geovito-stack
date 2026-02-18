#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STRAPI_BASE_URL="${STRAPI_BASE_URL:-http://127.0.0.1:1337}"
STRAPI_API_TOKEN="${STRAPI_API_TOKEN:-}"
MEDIA_SMOKE_ENV_FILE="${MEDIA_SMOKE_ENV_FILE:-$HOME/.config/geovito/media_smoke.env}"
FIXTURE_PATH="${FIXTURE_PATH:-$ROOT_DIR/tools/fixtures/media-smoke.png}"
CLEANUP="${MEDIA_SMOKE_CLEANUP:-true}"

if [[ -z "$STRAPI_API_TOKEN" && -f "$MEDIA_SMOKE_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$MEDIA_SMOKE_ENV_FILE"
  STRAPI_API_TOKEN="${STRAPI_API_TOKEN:-}"
fi

if [[ -z "$STRAPI_API_TOKEN" ]]; then
  echo "ERROR: STRAPI_API_TOKEN is required for upload smoke test."
  echo "Hint:"
  echo "  1) export STRAPI_API_TOKEN=..."
  echo "  2) or create secret file: bash tools/media_smoke_env_init.sh"
  exit 1
fi

if [[ ! -f "$FIXTURE_PATH" ]]; then
  echo "ERROR: fixture not found: $FIXTURE_PATH"
  exit 1
fi

echo "=============================================================="
echo "GEOVITO MEDIA UPLOAD SMOKE"
echo "STRAPI_BASE_URL=$STRAPI_BASE_URL"
echo "FIXTURE_PATH=$FIXTURE_PATH"
echo "=============================================================="

docker compose up -d strapi >/dev/null

response="$(curl -sS -X POST "$STRAPI_BASE_URL/api/upload" \
  -H "Authorization: Bearer $STRAPI_API_TOKEN" \
  -F "files=@$FIXTURE_PATH")"

parse_json='const fs=require("fs");
const input=fs.readFileSync(0,"utf8");
let data=null;
try{data=JSON.parse(input);}catch(e){console.error("PARSE_ERROR");process.exit(2);}
if(data && typeof data==="object" && data.error){
  const message=String(data.error.message||"unknown");
  const status=String(data.error.status||"");
  console.error(`API_ERROR:${status}:${message}`);
  process.exit(4);
}
if(!Array.isArray(data) || !data[0]){console.error("NO_FILE");process.exit(3);}
const file=data[0];
const out={id:file.id,mime:file.mime||"",ext:file.ext||"",url:file.url||""};
console.log(JSON.stringify(out));'

parse_err_file="$(mktemp)"
set +e
parsed="$(printf '%s' "$response" | docker run --rm -i node:20-alpine node -e "$parse_json" 2>"$parse_err_file")"
parse_code=$?
set -e
if [[ "$parse_code" -ne 0 ]]; then
  echo "FAIL: upload response invalid (code=${parse_code})"
  if [[ -s "$parse_err_file" ]]; then
    cat "$parse_err_file"
  fi
  echo "$response"
  rm -f "$parse_err_file"
  exit 1
fi
rm -f "$parse_err_file"

file_id="$(printf '%s' "$parsed" | docker run --rm -i node:20-alpine node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(0,"utf8"));console.log(d.id||"");')"
file_mime="$(printf '%s' "$parsed" | docker run --rm -i node:20-alpine node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(0,"utf8"));console.log(d.mime||"");')"
file_ext="$(printf '%s' "$parsed" | docker run --rm -i node:20-alpine node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(0,"utf8"));console.log(d.ext||"");')"

if [[ "$file_mime" != "image/webp" || "$file_ext" != ".webp" ]]; then
  echo "FAIL: upload not converted to webp (mime=$file_mime ext=$file_ext)"
  echo "$response"
  exit 1
fi

echo "PASS: upload converted to webp (mime=$file_mime ext=$file_ext)"

if [[ "$CLEANUP" == "true" && -n "$file_id" ]]; then
  curl -sS -X DELETE "$STRAPI_BASE_URL/api/upload/files/$file_id" \
    -H "Authorization: Bearer $STRAPI_API_TOKEN" >/dev/null
  echo "PASS: cleanup removed upload id=$file_id"
fi

echo "=============================================================="
echo "MEDIA UPLOAD SMOKE: PASS"
echo "=============================================================="
