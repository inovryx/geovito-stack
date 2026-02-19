#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PAGES_DEPLOY_ENV_FILE="${PAGES_DEPLOY_ENV_FILE:-$HOME/.config/geovito/pages_deploy.env}"
CF_PAGES_DEPLOY_HOOK_URL="${CF_PAGES_DEPLOY_HOOK_URL:-}"
FINGERPRINT_BASE_URL="${FINGERPRINT_BASE_URL:-https://geovito-stack.pages.dev}"
EXPECTED_SHA7="${EXPECTED_SHA7:-$(git rev-parse --short=7 HEAD)}"
DEPLOY_TIMEOUT_SECONDS="${DEPLOY_TIMEOUT_SECONDS:-900}"
DEPLOY_POLL_INTERVAL_SECONDS="${DEPLOY_POLL_INTERVAL_SECONDS:-15}"

usage() {
  cat <<'USAGE'
Usage:
  bash tools/pages_deploy_force.sh

Env:
  PAGES_DEPLOY_ENV_FILE         Secret file path (default: ~/.config/geovito/pages_deploy.env)
  CF_PAGES_DEPLOY_HOOK_URL      Cloudflare Pages deploy hook URL
  FINGERPRINT_BASE_URL          Fingerprint domain (default: https://geovito-stack.pages.dev)
  EXPECTED_SHA7                 Expected short SHA (default: current git HEAD short)
  DEPLOY_TIMEOUT_SECONDS        Poll timeout seconds (default: 900)
  DEPLOY_POLL_INTERVAL_SECONDS  Poll interval seconds (default: 15)
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "$CF_PAGES_DEPLOY_HOOK_URL" && -f "$PAGES_DEPLOY_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$PAGES_DEPLOY_ENV_FILE"
fi

if [[ -z "${CF_PAGES_DEPLOY_HOOK_URL:-}" ]]; then
  echo "ERROR: CF_PAGES_DEPLOY_HOOK_URL is required."
  echo "Hint:"
  echo "  bash tools/pages_deploy_env_init.sh"
  echo "  nano \"$PAGES_DEPLOY_ENV_FILE\""
  exit 1
fi

if [[ "${CF_PAGES_DEPLOY_HOOK_URL}" == *"REPLACE_WITH_REAL_DEPLOY_HOOK_URL"* ]]; then
  echo "ERROR: placeholder deploy hook found in $PAGES_DEPLOY_ENV_FILE"
  echo "Edit file and set real hook URL: nano \"$PAGES_DEPLOY_ENV_FILE\""
  exit 1
fi

normalize_sha7() {
  local value="$1"
  value="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
  echo "${value:0:7}"
}

extract_json_string() {
  local file="$1"
  local key="$2"
  tr -d '\n\r' < "$file" | sed -nE "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\\1/p"
}

expected7="$(normalize_sha7 "$EXPECTED_SHA7")"
start_epoch="$(date +%s)"
deadline_epoch="$((start_epoch + DEPLOY_TIMEOUT_SECONDS))"

echo "=============================================================="
echo "GEOVITO PAGES FORCE DEPLOY"
echo "expected_sha7=${expected7}"
echo "fingerprint_base_url=${FINGERPRINT_BASE_URL%/}"
echo "poll_interval=${DEPLOY_POLL_INTERVAL_SECONDS}s timeout=${DEPLOY_TIMEOUT_SECONDS}s"
echo "=============================================================="

trigger_code="$(curl -sS -o /tmp/geovito_pages_deploy_hook.out -w '%{http_code}' -X POST "$CF_PAGES_DEPLOY_HOOK_URL" || true)"
if [[ "$trigger_code" -lt 200 || "$trigger_code" -ge 300 ]]; then
  echo "FAIL: deploy hook trigger failed (status=$trigger_code)"
  cat /tmp/geovito_pages_deploy_hook.out || true
  exit 1
fi
echo "PASS: deploy hook accepted (status=$trigger_code)"

while true; do
  now_epoch="$(date +%s)"
  if [[ "$now_epoch" -ge "$deadline_epoch" ]]; then
    echo "FAIL: deploy timeout. latest fingerprint sha did not reach ${expected7}."
    echo "Check Cloudflare Pages deployment logs."
    exit 1
  fi

  tmp_file="$(mktemp)"
  code="$(curl -sS -L --max-time 20 -o "$tmp_file" -w '%{http_code}' \
    "${FINGERPRINT_BASE_URL%/}/.well-known/geovito-build.json?v=$(date +%s)" || true)"

  if [[ "$code" == "200" ]]; then
    got_sha7="$(extract_json_string "$tmp_file" "build_sha7")"
    got_sha7="$(normalize_sha7 "${got_sha7:-}")"
    rm -f "$tmp_file"
    if [[ -n "$got_sha7" && "$got_sha7" == "$expected7" ]]; then
      echo "PASS: fingerprint updated (build_sha7=${got_sha7})"
      echo "=============================================================="
      echo "PAGES FORCE DEPLOY: PASS"
      echo "Next: bash tools/smoke_access.sh"
      echo "=============================================================="
      exit 0
    fi
    echo "INFO: fingerprint currently ${got_sha7:-unknown}, waiting..."
  else
    rm -f "$tmp_file"
    echo "INFO: fingerprint endpoint status=${code}, waiting..."
  fi

  sleep "$DEPLOY_POLL_INTERVAL_SECONDS"
done
