#!/usr/bin/env bash
set -euo pipefail

SUBJECT="${1:-${ALERT_SUBJECT:-Geovito Alert}}"
BODY="${2:-${ALERT_BODY:-No body provided}}"
ALERT_TELEGRAM_BOT_TOKEN="${ALERT_TELEGRAM_BOT_TOKEN:-}"
ALERT_TELEGRAM_CHAT_ID="${ALERT_TELEGRAM_CHAT_ID:-}"
ALERT_EMAIL_TO="${ALERT_EMAIL_TO:-}"
ALERT_EMAIL_FROM="${ALERT_EMAIL_FROM:-}"
ALERT_ALLOW_PARTIAL="${ALERT_ALLOW_PARTIAL:-false}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

sent_count=0
failed_count=0

if [[ -n "$ALERT_TELEGRAM_BOT_TOKEN" && -n "$ALERT_TELEGRAM_CHAT_ID" ]]; then
  telegram_code="$(curl -sS -o /tmp/telegram-alert.json -w '%{http_code}' \
    -X POST "https://api.telegram.org/bot${ALERT_TELEGRAM_BOT_TOKEN}/sendMessage" \
    -H 'Content-Type: application/json' \
    -d "{\"chat_id\":\"${ALERT_TELEGRAM_CHAT_ID}\",\"text\":\"${SUBJECT}\\n${BODY}\"}" || true)"
  if [[ "$telegram_code" == "200" ]]; then
    pass "telegram alert sent"
    sent_count=$((sent_count + 1))
  else
    echo "WARN: telegram alert failed (status=${telegram_code})"
    failed_count=$((failed_count + 1))
  fi
fi

if [[ -n "$ALERT_EMAIL_TO" && -n "$ALERT_EMAIL_FROM" ]]; then
  set +e
  docker compose exec -T -e ALERT_EMAIL_TO="$ALERT_EMAIL_TO" -e ALERT_EMAIL_FROM="$ALERT_EMAIL_FROM" -e ALERT_SUBJECT="$SUBJECT" -e ALERT_BODY="$BODY" strapi node - <<'NODE'
const nodemailer = require('nodemailer');

(async () => {
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  const subject = process.env.ALERT_SUBJECT || 'Geovito Alert';
  const body = process.env.ALERT_BODY || '';

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST,
    port: Number(process.env.EMAIL_SMTP_PORT || 587),
    secure: String(process.env.EMAIL_SMTP_SECURE || 'false').toLowerCase() === 'true',
    ignoreTLS: String(process.env.EMAIL_SMTP_IGNORE_TLS || 'false').toLowerCase() === 'true',
    requireTLS: String(process.env.EMAIL_SMTP_REQUIRE_TLS || 'true').toLowerCase() === 'true',
    auth: process.env.EMAIL_SMTP_USER ? {
      user: process.env.EMAIL_SMTP_USER,
      pass: process.env.EMAIL_SMTP_PASS,
    } : undefined,
    tls: {
      rejectUnauthorized: String(process.env.EMAIL_SMTP_REJECT_UNAUTHORIZED || 'true').toLowerCase() === 'true',
    },
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
  });

  process.stdout.write('EMAIL_SENT');
})();
NODE
  email_code=$?
  set -e
  if [[ $email_code -eq 0 ]]; then
    pass "email alert sent"
    sent_count=$((sent_count + 1))
  else
    echo "WARN: email alert failed"
    failed_count=$((failed_count + 1))
  fi
fi

if [[ $sent_count -eq 0 && $failed_count -eq 0 ]]; then
  fail "no alert channel configured"
fi

if [[ $failed_count -gt 0 && "$ALERT_ALLOW_PARTIAL" != "true" ]]; then
  fail "one or more alert channels failed"
fi

pass "alert send completed (sent=${sent_count}, failed=${failed_count})"
