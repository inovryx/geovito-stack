#!/usr/bin/env bash
set -euo pipefail

TARGET_FILE="${BACKUP_ENV_FILE:-$HOME/.config/geovito/backup.env}"
TARGET_DIR="$(dirname "$TARGET_FILE")"

mkdir -p "$TARGET_DIR"

if [[ -f "$TARGET_FILE" ]]; then
  chmod 600 "$TARGET_FILE"
  echo "INFO: mevcut dosya bulundu -> $TARGET_FILE"
  echo "INFO: izinler 600 olarak guncellendi."
  exit 0
fi

cat > "$TARGET_FILE" <<'EOF'
# Root folder where backup snapshots are stored.
BACKUP_ROOT="$HOME/backups/geovito"
# Auto-prune snapshots older than N days after each backup.
BACKUP_KEEP_DAYS=14
EOF

chmod 600 "$TARGET_FILE"

cat <<EOF
PASS: olusturuldu -> $TARGET_FILE
Sonraki adim:
  1) dosyayi ac: nano "$TARGET_FILE"
  2) backup al: bash tools/backup_create.sh
  3) backup dogrula: bash tools/backup_verify.sh
EOF
