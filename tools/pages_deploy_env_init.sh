#!/usr/bin/env bash
set -euo pipefail

TARGET_FILE="${PAGES_DEPLOY_ENV_FILE:-$HOME/.config/geovito/pages_deploy.env}"
TARGET_DIR="$(dirname "$TARGET_FILE")"

mkdir -p "$TARGET_DIR"

if [[ -f "$TARGET_FILE" ]]; then
  chmod 600 "$TARGET_FILE"
  echo "INFO: mevcut dosya bulundu -> $TARGET_FILE"
  echo "INFO: izinler 600 olarak guncellendi."
  exit 0
fi

cat > "$TARGET_FILE" <<'EOF'
# Cloudflare Pages -> Deploy hooks -> Add deploy hook
CF_PAGES_DEPLOY_HOOK_URL='REPLACE_WITH_REAL_DEPLOY_HOOK_URL'
EOF

chmod 600 "$TARGET_FILE"

cat <<EOF
PASS: olusturuldu -> $TARGET_FILE
Sonraki adim:
  1) dosyayi ac: nano "$TARGET_FILE"
  2) gercek CF_PAGES_DEPLOY_HOOK_URL degerini gir
  3) deploy tetikle: bash tools/pages_deploy_force.sh
EOF
