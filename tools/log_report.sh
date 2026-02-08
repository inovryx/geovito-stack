#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if command -v node >/dev/null 2>&1; then
  node tools/log_report.js "$@"
  exit 0
fi

docker run --rm -v "$ROOT_DIR":/repo -w /repo node:20-alpine node tools/log_report.js "$@"
