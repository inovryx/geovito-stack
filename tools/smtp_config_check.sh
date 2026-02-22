#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FAIL_COUNT=0

pass() {
  echo "PASS: $1"
}

warn() {
  echo "WARN: $1"
}

fail() {
  echo "FAIL: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

read_env_from_strapi() {
  local key="$1"
  docker compose exec -T strapi printenv "$key" 2>/dev/null | tr -d '\r' | tail -n 1
}

wait_for_strapi_ready() {
  local attempts="${1:-45}"
  local i=0
  while [[ "$i" -lt "$attempts" ]]; do
    if curl -fsS --max-time 5 "http://127.0.0.1:1337/admin" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

echo "=============================================================="
echo "GEOVITO SMTP CONFIG CHECK"
echo "=============================================================="

if [[ "${SKIP_STRAPI:-0}" != "1" ]]; then
  if docker compose ps --status running --services 2>/dev/null | grep -qx "strapi"; then
    pass "strapi container already running"
  else
    docker compose up -d strapi >/dev/null
  fi
fi

if ! wait_for_strapi_ready 45; then
  fail "strapi readiness check failed"
  echo "=============================================================="
  echo "SMTP CONFIG CHECK: FAIL (${FAIL_COUNT} issue)"
  echo "=============================================================="
  exit 1
fi
pass "strapi readiness check"

email_provider="$(read_env_from_strapi EMAIL_PROVIDER)"
email_provider="${email_provider:-sendmail}"
echo "EMAIL_PROVIDER=${email_provider}"

if [[ "$email_provider" != "nodemailer" ]]; then
  warn "SMTP disabled (EMAIL_PROVIDER=${email_provider}). Set EMAIL_PROVIDER=nodemailer to enable real SMTP sending."
  echo "=============================================================="
  echo "SMTP CONFIG CHECK: PASS (provider=${email_provider})"
  echo "=============================================================="
  exit 0
fi

smtp_host="$(read_env_from_strapi EMAIL_SMTP_HOST)"
smtp_port="$(read_env_from_strapi EMAIL_SMTP_PORT)"
smtp_user="$(read_env_from_strapi EMAIL_SMTP_USER)"
smtp_pass="$(read_env_from_strapi EMAIL_SMTP_PASS)"
default_from="$(read_env_from_strapi EMAIL_DEFAULT_FROM)"
default_reply_to="$(read_env_from_strapi EMAIL_DEFAULT_REPLY_TO)"

[[ -n "$smtp_host" ]] && pass "EMAIL_SMTP_HOST is set" || fail "EMAIL_SMTP_HOST is empty"
[[ -n "$smtp_port" ]] && pass "EMAIL_SMTP_PORT is set" || fail "EMAIL_SMTP_PORT is empty"
[[ -n "$smtp_user" ]] && pass "EMAIL_SMTP_USER is set" || fail "EMAIL_SMTP_USER is empty"
[[ -n "$smtp_pass" ]] && pass "EMAIL_SMTP_PASS is set" || fail "EMAIL_SMTP_PASS is empty"
[[ -n "$default_from" ]] && pass "EMAIL_DEFAULT_FROM is set" || fail "EMAIL_DEFAULT_FROM is empty"
[[ -n "$default_reply_to" ]] && pass "EMAIL_DEFAULT_REPLY_TO is set" || fail "EMAIL_DEFAULT_REPLY_TO is empty"

if [[ -n "$smtp_port" ]] && ! [[ "$smtp_port" =~ ^[0-9]+$ ]]; then
  fail "EMAIL_SMTP_PORT must be numeric (got: ${smtp_port})"
fi

if [[ "$FAIL_COUNT" -eq 0 ]]; then
  tcp_check_output="$(
    docker compose exec -T strapi node -e '
      const net = require("net");
      const host = process.argv[1];
      const port = Number(process.argv[2]);
      const socket = net.createConnection({ host, port, timeout: 5000 }, () => {
        console.log("ok");
        socket.end();
      });
      socket.on("timeout", () => {
        console.error("timeout");
        process.exit(2);
      });
      socket.on("error", (err) => {
        console.error(err.message || "tcp_error");
        process.exit(1);
      });
    ' "$smtp_host" "$smtp_port" 2>&1
  )" || true

  if [[ "$tcp_check_output" == *"ok"* ]]; then
    pass "SMTP host:port reachable from strapi container (${smtp_host}:${smtp_port})"
  else
    fail "SMTP host:port not reachable from strapi container (${smtp_host}:${smtp_port}) -> ${tcp_check_output}"
  fi
fi

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "=============================================================="
  echo "SMTP CONFIG CHECK: FAIL (${FAIL_COUNT} issue)"
  echo "=============================================================="
  exit 1
fi

echo "=============================================================="
echo "SMTP CONFIG CHECK: PASS"
echo "=============================================================="
exit 0
