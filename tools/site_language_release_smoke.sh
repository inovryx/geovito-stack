#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${SITE_LANGUAGE_RELEASE_ARTIFACT_DIR:-$ROOT_DIR/artifacts/i18n}"

mkdir -p "$ARTIFACT_DIR"

if command -v node >/dev/null 2>&1; then
  (
    cd "$ROOT_DIR"
    ROOT_DIR="$ROOT_DIR" ARTIFACT_DIR="$ARTIFACT_DIR" node tools/site_language_release_smoke.mjs
  )
  exit 0
fi

docker run --rm \
  -v "$ROOT_DIR:/repo" \
  -w /repo \
  -e ROOT_DIR="/repo" \
  -e ARTIFACT_DIR="/repo/artifacts/i18n" \
  node:20-alpine \
  node tools/site_language_release_smoke.mjs
