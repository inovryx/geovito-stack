#!/usr/bin/env bash
set -euo pipefail

IMPORT_ENABLED="${IMPORT_ENABLED:-false}"

if [[ "$IMPORT_ENABLED" != "true" ]]; then
  echo "[DORMANT] Import disabled. Set IMPORT_ENABLED=true only for future controlled phases."
  echo "Bu repoda import execution varsayilan olarak kapali tutulur."
  exit 1
fi

echo "[DORMANT] Atlas import execution bu repoda devre disidir."
echo "Import kontrati ve baglanti noktasi icin: import-interface/README.md"
echo "IMPORT_ENABLED=true olsa bile bu script bilerek aktif import calistirmaz."
exit 1
