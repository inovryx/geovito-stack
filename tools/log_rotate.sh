#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_ROOT="${LOG_ROOT:-$ROOT_DIR/logs}"
MAX_SIZE_MB="${MAX_SIZE_MB:-20}"
KEEP_ROTATIONS="${KEEP_ROTATIONS:-10}"
GZIP_ROTATED="${GZIP_ROTATED:-1}"

MAX_BYTES="$((MAX_SIZE_MB * 1024 * 1024))"
DOMAINS=(atlas blog ui search suggestions ops import ai)

timestamp() {
  date -u +%Y%m%dT%H%M%SZ
}

log() {
  echo "[log-rotate] $*"
}

size_bytes() {
  local file="$1"
  wc -c <"$file"
}

rotate_file() {
  local file="$1"
  local size
  size="$(size_bytes "$file")"

  if (( size <= MAX_BYTES )); then
    return 0
  fi

  local stamp rotated
  stamp="$(timestamp)"
  rotated="${file}.${stamp}"

  mv "$file" "$rotated"
  : >"$file"

  if [[ "$GZIP_ROTATED" == "1" ]]; then
    gzip -f "$rotated"
    rotated="${rotated}.gz"
  fi

  log "rotated $file -> $rotated (size=${size}B)"

  local keep_count=0
  shopt -s nullglob
  for old in $(ls -1t "${file}."*); do
    keep_count=$((keep_count + 1))
    if (( keep_count > KEEP_ROTATIONS )); then
      rm -f "$old"
      log "pruned old rotation $old"
    fi
  done
  shopt -u nullglob
}

main() {
  mkdir -p "$LOG_ROOT"
  log "root=$LOG_ROOT max_size_mb=$MAX_SIZE_MB keep=$KEEP_ROTATIONS gzip=$GZIP_ROTATED"

  for domain in "${DOMAINS[@]}"; do
    local_dir="$LOG_ROOT/$domain"
    mkdir -p "$local_dir"

    shopt -s nullglob
    files=("$local_dir"/*.log "$local_dir"/*.jsonl)
    shopt -u nullglob

    for file in "${files[@]}"; do
      [[ -f "$file" ]] || continue
      rotate_file "$file"
    done
  done

  log "rotation pass complete"
}

main "$@"
