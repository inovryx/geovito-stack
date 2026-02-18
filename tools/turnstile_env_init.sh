#!/usr/bin/env bash
set -euo pipefail

TARGET_FILE="${TURNSTILE_ENV_FILE:-$HOME/.config/geovito/turnstile.env}"
TARGET_DIR="$(dirname "$TARGET_FILE")"

mkdir -p "$TARGET_DIR"

if [[ -f "$TARGET_FILE" ]]; then
  chmod 600 "$TARGET_FILE"
  echo "INFO: mevcut dosya bulundu -> $TARGET_FILE"
  echo "INFO: izinler 600 olarak guncellendi."
  exit 0
fi

cat >"$TARGET_FILE" <<'EOF'
PUBLIC_TURNSTILE_SITE_KEY='REPLACE_WITH_REAL_SITE_KEY'
TURNSTILE_SECRET_KEY='REPLACE_WITH_REAL_SECRET_KEY'
EOF

chmod 600 "$TARGET_FILE"

cat <<EOF
PASS: olusturuldu -> $TARGET_FILE
Sonraki adim:
  1) dosyayi ac: nano "$TARGET_FILE"
  2) gercek key degerlerini gir
  3) enable et: bash tools/turnstile_guest_comments.sh enable
EOF
