#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${FRONTEND_DIR:-$ROOT_DIR/frontend}"
STRICT_MODE="${I18N_AUDIT_STRICT:-0}"
NODE_IMAGE="${I18N_AUDIT_NODE_IMAGE:-node:20-alpine}"

echo "=============================================================="
echo "GEOVITO I18N SOURCE AUDIT"
echo "frontend_dir=${FRONTEND_DIR}"
echo "strict_mode=${STRICT_MODE}"
echo "=============================================================="

if [[ ! -d "$FRONTEND_DIR/src/i18n" ]]; then
  echo "FAIL: i18n directory missing -> $FRONTEND_DIR/src/i18n"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "FAIL: docker command is required"
  exit 1
fi

PARITY_OUTPUT="$(
  docker run --rm -v "$FRONTEND_DIR":/work -w /work "$NODE_IMAGE" \
    node scripts/i18n_workflow.mjs check 2>&1
)"
echo "$PARITY_OUTPUT"

AUDIT_OUTPUT="$(
  docker run --rm -v "$FRONTEND_DIR":/work -w /work "$NODE_IMAGE" sh -lc 'node <<"NODE"
const fs = require("fs");
const path = require("path");
const root = "/work";

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const flatten = (obj, prefix = "") =>
  Object.entries(obj).reduce((acc, [key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(acc, flatten(value, full));
    } else {
      acc[full] = String(value);
    }
    return acc;
  }, {});

const en = readJson(path.join(root, "src/i18n/en.json"));
const enFlat = flatten(en);
const enKeys = new Set(Object.keys(enFlat));

const files = [];
const skipDirs = new Set(["dist", "node_modules", ".astro", "test-results"]);
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) {
      if (skipDirs.has(name)) continue;
      walk(fp);
      continue;
    }
    if (/\.(astro|ts|tsx|js|mjs)$/.test(name)) files.push(fp);
  }
};
walk(path.join(root, "src"));

const patterns = [
  /translate\(\s*ui\s*,\s*["\x27]([^"\x27]+)["\x27]/g,
  /\bt\(\s*["\x27]([^"\x27]+)["\x27]/g,
];

const referenced = new Map();
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content))) {
      const key = match[1];
      if (!referenced.has(key)) referenced.set(key, new Set());
      referenced.get(key).add(file.replace(`${root}/`, ""));
    }
  }
}

const missing = [];
const byFile = new Map();
for (const [key, fileSet] of referenced.entries()) {
  if (enKeys.has(key)) continue;
  const filesArr = Array.from(fileSet);
  missing.push({ key, files: filesArr });
  for (const f of filesArr) byFile.set(f, (byFile.get(f) || 0) + 1);
}

missing.sort((a, b) => a.key.localeCompare(b.key));
const topFiles = Array.from(byFile.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);

console.log(`EN_KEY_COUNT=${enKeys.size}`);
console.log(`REFERENCED_KEY_COUNT=${referenced.size}`);
console.log(`MISSING_IN_EN_COUNT=${missing.length}`);
console.log(`MISSING_RATIO=${((missing.length / Math.max(1, referenced.size)) * 100).toFixed(1)}%`);
console.log("TOP_MISSING_FILES_BEGIN");
for (const [file, count] of topFiles) {
  console.log(`${file}::${count}`);
}
console.log("TOP_MISSING_FILES_END");
NODE'
)"

echo "$AUDIT_OUTPUT"

MISSING_COUNT="$(echo "$AUDIT_OUTPUT" | awk -F= '/^MISSING_IN_EN_COUNT=/{print $2}' | tail -n1)"
if [[ -z "${MISSING_COUNT}" ]]; then
  echo "FAIL: could not parse MISSING_IN_EN_COUNT"
  exit 1
fi

echo "--------------------------------------------------------------"
echo "Top missing file buckets:"
echo "$AUDIT_OUTPUT" | awk '
  /^TOP_MISSING_FILES_BEGIN$/ { in_block=1; next }
  /^TOP_MISSING_FILES_END$/ { in_block=0; next }
  in_block {
    split($0, parts, "::");
    printf(" - %s (%s)\n", parts[1], parts[2]);
  }
'
echo "--------------------------------------------------------------"

if [[ "$MISSING_COUNT" -gt 0 ]]; then
  if [[ "$STRICT_MODE" == "1" ]]; then
    echo "FAIL: missing en.json source keys detected (${MISSING_COUNT})"
    exit 1
  fi
  echo "WARN: missing en.json source keys detected (${MISSING_COUNT})"
  echo "PASS: i18n source audit completed in warn mode"
  exit 0
fi

echo "PASS: i18n source audit completed"
