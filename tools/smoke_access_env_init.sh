#!/usr/bin/env bash
set -euo pipefail

TARGET="${SMOKE_ACCESS_ENV_FILE:-$HOME/.config/geovito/smoke_access.env}"
TARGET_DIR="$(dirname "$TARGET")"

mkdir -p "$TARGET_DIR"

if [[ -f "$TARGET" ]]; then
  chmod 600 "$TARGET"
  echo "INFO: mevcut dosya bulundu -> $TARGET"
  echo "INFO: izinler 600 olarak guncellendi."
  exit 0
fi

cat > "$TARGET" <<'EOF'
CF_ACCESS_CLIENT_ID='REPLACE_WITH_REAL_CLIENT_ID'
CF_ACCESS_CLIENT_SECRET='REPLACE_WITH_REAL_CLIENT_SECRET'
# Optional: set an existing creator username to enable /u + /@ smoke checks.
# CREATOR_USERNAME='existing_username'
EOF

chmod 600 "$TARGET"

echo "PASS: olusturuldu -> $TARGET"
echo "Sonraki adim:"
echo "  1) dosyayi acip gercek degerleri gir"
echo "  2) bash tools/smoke_access.sh"
echo ""
echo "Opsiyonel creator smoke ayari:"
echo "  bash tools/smoke_access_set_creator.sh <creator_username>"
