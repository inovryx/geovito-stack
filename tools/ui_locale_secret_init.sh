#!/usr/bin/env bash
set -euo pipefail

TARGET_FILE="${UI_LOCALE_SECRET_FILE:-$HOME/.config/geovito/ui_locale.env}"
TARGET_DIR="$(dirname "$TARGET_FILE")"

mkdir -p "$TARGET_DIR"

if [[ -f "$TARGET_FILE" ]]; then
  chmod 600 "$TARGET_FILE"
  echo "INFO: mevcut dosya bulundu -> $TARGET_FILE"
  echo "INFO: izinler 600 olarak guncellendi."
  exit 0
fi

cat > "$TARGET_FILE" <<'EOF'
STRAPI_API_TOKEN='REPLACE_WITH_REAL_STRAPI_API_TOKEN'
EOF

chmod 600 "$TARGET_FILE"

cat <<EOF
PASS: olusturuldu -> $TARGET_FILE
Sonraki adim:
  1) dosyayi ac: nano "$TARGET_FILE"
  2) gercek STRAPI_API_TOKEN degerini gir
  3) publish calistir: bash tools/ui_locale_publish.sh
EOF
