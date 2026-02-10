#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ATLAS_INPUT="${ATLAS_INPUT:-artifacts/search/atlas-documents.json}"
BLOG_INPUT="artifacts/search/blog-documents.json"
HAS_DIRECT_TEXT="false"

for ((i = 1; i <= $#; i++)); do
  arg="${!i}"
  if [[ "$arg" == "--text" ]] || [[ "$arg" == "--text-file" ]]; then
    HAS_DIRECT_TEXT="true"
  fi

  if [[ "$arg" == "--blog" ]]; then
    next_index=$((i + 1))
    if [[ $next_index -le $# ]]; then
      BLOG_INPUT="${!next_index}"
    fi
  fi
done

if [[ "$ATLAS_INPUT" = /* ]]; then
  if [[ "$ATLAS_INPUT" == "$ROOT_DIR/"* ]]; then
    ATLAS_INPUT="artifacts/${ATLAS_INPUT#"$ROOT_DIR/artifacts/"}"
  else
    echo "ERROR: Absolute ATLAS_INPUT must be under $ROOT_DIR"
    exit 1
  fi
fi

if [[ ! -f "$ATLAS_INPUT" ]]; then
  echo "Atlas search documents not found at $ATLAS_INPUT"
  echo "Running export to generate canonical EN targets..."
  bash tools/export_search_documents.sh >/dev/null
fi

if [[ "$HAS_DIRECT_TEXT" == "false" ]]; then
  if [[ "$BLOG_INPUT" = /* ]]; then
    if [[ "$BLOG_INPUT" == "$ROOT_DIR/"* ]]; then
      BLOG_INPUT="${BLOG_INPUT#"$ROOT_DIR/"}"
    else
      echo "ERROR: --blog absolute path must be under $ROOT_DIR"
      exit 1
    fi
  fi

  if [[ ! -f "$BLOG_INPUT" ]]; then
    echo "Blog documents not found at $BLOG_INPUT"
    echo "Running export to generate blog source documents..."
    OUTPUT_PATH="$BLOG_INPUT" bash tools/export_blog_documents.sh >/dev/null
  fi
fi

docker run --rm \
  -v "$ROOT_DIR:/opt/work" \
  -w /opt/work \
  node:20-alpine \
  node tools/suggest_internal_links.js --atlas "$ATLAS_INPUT" "$@"
