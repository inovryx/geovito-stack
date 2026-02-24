#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET="${SMOKE_ACCESS_ENV_FILE:-$HOME/.config/geovito/smoke_access.env}"

usage() {
  cat <<'EOF'
Usage:
  bash tools/smoke_access_set_creator.sh <creator_username>
  bash tools/smoke_access_set_creator.sh --clear

Purpose:
  Set or clear CREATOR_USERNAME in smoke access env file.
  release_deploy_smoke.sh auto-enables creator smoke when this value exists.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

bash tools/smoke_access_env_init.sh >/dev/null

normalize_username() {
  local raw="$1"
  local value
  value="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  value="${value#@}"
  printf '%s' "$value"
}

write_without_creator_line() {
  local src="$1"
  local tmp
  tmp="$(mktemp)"
  awk '!/^CREATOR_USERNAME=/' "$src" > "$tmp"
  mv "$tmp" "$src"
}

if [[ "${1:-}" == "--clear" ]]; then
  write_without_creator_line "$TARGET"
  chmod 600 "$TARGET"
  echo "PASS: CREATOR_USERNAME removed from $TARGET"
  echo "Next: bash tools/smoke_access.sh"
  exit 0
fi

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

USERNAME="$(normalize_username "$1")"
if ! [[ "$USERNAME" =~ ^[a-z0-9][a-z0-9._-]{1,30}$ ]]; then
  echo "FAIL: invalid creator username: $1"
  echo "Allowed: lowercase letters, numbers, ., _, - (2-31 chars)."
  exit 1
fi

TMP_FILE="$(mktemp)"
awk -v line="CREATOR_USERNAME='${USERNAME}'" '
BEGIN { updated=0 }
/^CREATOR_USERNAME=/ {
  print line
  updated=1
  next
}
{ print }
END {
  if (!updated) print line
}
' "$TARGET" > "$TMP_FILE"
mv "$TMP_FILE" "$TARGET"
chmod 600 "$TARGET"

echo "PASS: CREATOR_USERNAME set -> ${USERNAME}"
echo "File: $TARGET"
echo "Next: bash tools/smoke_access.sh"
