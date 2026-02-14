#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: bash tools/hash_ops_token.sh '<OPS_VIEW_TOKEN>'"
  exit 1
fi

token="$1"

if command -v sha256sum >/dev/null 2>&1; then
  printf '%s' "$token" | sha256sum | awk '{print $1}'
  exit 0
fi

if command -v shasum >/dev/null 2>&1; then
  printf '%s' "$token" | shasum -a 256 | awk '{print $1}'
  exit 0
fi

if command -v openssl >/dev/null 2>&1; then
  printf '%s' "$token" | openssl dgst -sha256 -r | awk '{print $1}'
  exit 0
fi

echo "No SHA-256 tool found (sha256sum/shasum/openssl)."
exit 1
