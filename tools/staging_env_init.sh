#!/usr/bin/env bash
set -euo pipefail

TARGET_FILE="${STAGING_ENV_FILE:-$HOME/.config/geovito/staging.env}"
mkdir -p "$(dirname "$TARGET_FILE")"

if [[ ! -f "$TARGET_FILE" ]]; then
  cat > "$TARGET_FILE" <<'EOT'
# Staging runtime settings (host-local, not committed)
STAGING_BASE_URL=https://staging.geovito.com
STAGING_API_BASE=https://cms-staging.geovito.com
STAGING_SMTP_MODE=mailsink
STAGING_SMTP_BLOCK_REAL=true
STAGING_CF_ACCESS_CLIENT_ID=
STAGING_CF_ACCESS_CLIENT_SECRET=
STAGING_HEALTH_TOKEN=
EOT
  echo "PASS: created -> $TARGET_FILE"
else
  echo "INFO: existing file found -> $TARGET_FILE"
fi

chmod 600 "$TARGET_FILE"
echo "INFO: permissions set to 600"
echo "Next:"
echo "  1) nano \"$TARGET_FILE\""
echo "  2) bash tools/staging_health.sh"
echo "  3) bash tools/staging_isolation_check.sh"
