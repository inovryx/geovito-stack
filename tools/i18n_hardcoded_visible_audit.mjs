import fs from 'node:fs';
import path from 'node:path';

const frontendDir = process.env.FRONTEND_DIR_IN_CONTAINER || '/repo/frontend';
const artifactDir = process.env.ARTIFACT_DIR_IN_CONTAINER || '/repo/artifacts/i18n';
const strictMode = process.env.I18N_HARDCODED_AUDIT_STRICT === '1';
const failOnNew = process.env.I18N_HARDCODED_AUDIT_FAIL_ON_NEW === '1';
const baselinePath = process.env.I18N_HARDCODED_AUDIT_BASELINE || path.join(artifactDir, 'hardcoded-visible-strings-baseline.json');

const scopePrefixes = [
  'src/pages/[lang]/dashboard/',
  'src/pages/[lang]/atlas/',
  'src/pages/[lang]/account/',
  'src/pages/[lang]/auth/',
  'src/pages/[lang]/login',
  'src/pages/[lang]/register',
  'src/pages/[lang]/forgot-password',
  'src/pages/[lang]/reset-password',
  'src/pages/[lang]/search/',
  'src/pages/[lang]/@[username]/',
  'src/pages/u/[username]/',
  'src/components/',
  'src/layouts/',
];

const includeFile = (relativePath) => {
  if (!/\.(astro|ts|tsx|js|mjs)$/.test(relativePath)) return false;
  return scopePrefixes.some((prefix) => relativePath.startsWith(prefix));
};

const classifySurface = (relativePath) => {
  if (relativePath.startsWith('src/pages/[lang]/dashboard/')) return 'dashboard';
  if (relativePath.startsWith('src/pages/[lang]/atlas/')) return 'atlas';
  if (relativePath.startsWith('src/pages/[lang]/account/')) return 'account';
  if (relativePath.startsWith('src/pages/[lang]/auth/') || relativePath.startsWith('src/pages/[lang]/login') || relativePath.startsWith('src/pages/[lang]/register') || relativePath.startsWith('src/pages/[lang]/forgot-password') || relativePath.startsWith('src/pages/[lang]/reset-password')) return 'auth';
  if (relativePath.startsWith('src/pages/[lang]/@[username]/') || relativePath.startsWith('src/pages/u/[username]/')) return 'profile';
  if (relativePath === 'src/components/LeftSidebar.astro') return 'sidebar';
  if (relativePath === 'src/components/RightTools.astro') return 'righttools';
  if (relativePath === 'src/components/Nav.astro') return 'navigation';
  if (relativePath.startsWith('src/layouts/')) return 'layout';
  if (relativePath.includes('/admin') || relativePath.includes('/owner') || relativePath.includes('/moderation')) return 'admin';
  return 'components';
};

const walkFiles = (dir, results = []) => {
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (['node_modules', 'dist', '.astro', 'test-results'].includes(entry)) continue;
      walkFiles(fullPath, results);
      continue;
    }
    const relativePath = fullPath.replace(`${frontendDir}/`, '');
    if (includeFile(relativePath)) results.push(relativePath);
  }
  return results;
};

const lineNumberAt = (source, index) => source.slice(0, index).split('\n').length;

const normalizeText = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const stripAstroFrontmatter = (relativePath, source) => {
  if (!relativePath.endsWith('.astro')) return source;
  if (!source.startsWith('---')) return source;
  const endMarker = source.indexOf('\n---', 3);
  if (endMarker < 0) return source;
  const endIndex = source.indexOf('\n', endMarker + 1);
  if (endIndex < 0) return source;
  return `${' '.repeat(endIndex)}${source.slice(endIndex)}`;
};

const isLikelyVisibleText = (value) => {
  const text = normalizeText(value);
  if (!text) return false;
  if (text.length < 2) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/[{}();:=|]/.test(text)) return false;
  if (/\?\./.test(text)) return false;
  if (/^null$/i.test(text)) return false;
  if (/^(https?:|\/|#|[A-Z_\-]{2,})/.test(text)) return false;
  if (/^(aria-|data-|class|id)$/i.test(text)) return false;
  if (/^[\-–—•·]+$/.test(text)) return false;
  if (/\{\{?|\$\{|`/.test(text)) return false;
  if (/^(en|tr|fr|de|es|ru|zh-cn)$/i.test(text)) return false;
  return true;
};

const findings = [];
const files = walkFiles(path.join(frontendDir, 'src')).sort((a, b) => a.localeCompare(b));

const pushFinding = ({ type, kind, relativePath, index, text }) => {
  const normalized = normalizeText(text);
  if (!isLikelyVisibleText(normalized)) return;
  findings.push({
    type,
    kind,
    file: relativePath,
    line: lineNumberAt(fileSources.get(relativePath), index),
    text: normalized,
    surface: classifySurface(relativePath),
    fingerprint: `${relativePath}|${lineNumberAt(fileSources.get(relativePath), index)}|${kind}|${normalized}`,
  });
};

const fileSources = new Map();
for (const relativePath of files) {
  const source = fs.readFileSync(path.join(frontendDir, relativePath), 'utf8');
  fileSources.set(relativePath, source);
}

for (const relativePath of files) {
  const source = fileSources.get(relativePath) || '';
  const templateSource = stripAstroFrontmatter(relativePath, source);

  const textNodePattern = />([^<>{]+)</g;
  textNodePattern.lastIndex = 0;
  let match;
  while ((match = textNodePattern.exec(templateSource))) {
    const chunk = match[1];
    const near = templateSource.slice(Math.max(0, match.index - 80), Math.min(templateSource.length, match.index + 80));
    if (/translate\(|\bt\(/.test(near)) continue;
    pushFinding({
      type: 'hardcoded_visible_string',
      kind: 'text_node',
      relativePath,
      index: match.index,
      text: chunk,
    });
  }

  const attrPattern = /(aria-label|title|placeholder|alt|label)\s*=\s*(["'])([^"']+)\2/g;
  attrPattern.lastIndex = 0;
  while ((match = attrPattern.exec(templateSource))) {
    const value = match[3] || '';
    if (/\{.*\}/.test(value)) continue;
    const near = templateSource.slice(Math.max(0, match.index - 120), Math.min(templateSource.length, match.index + 120));
    if (/translate\(|\bt\(/.test(near)) continue;
    pushFinding({
      type: 'hardcoded_visible_string',
      kind: `attribute:${match[1]}`,
      relativePath,
      index: match.index,
      text: value,
    });
  }

  const scriptPattern = /(setFeedback|textContent\s*=|innerText\s*=|innerHTML\s*=)\s*(["'`])([^"'`]+)\2/g;
  scriptPattern.lastIndex = 0;
  while ((match = scriptPattern.exec(source))) {
    const value = match[3] || '';
    const near = source.slice(Math.max(0, match.index - 120), Math.min(source.length, match.index + 120));
    if (/translate\(|\bt\(/.test(near)) continue;
    pushFinding({
      type: 'hardcoded_visible_string',
      kind: 'script_message',
      relativePath,
      index: match.index,
      text: value,
    });
  }
}

const dedupMap = new Map();
for (const item of findings) {
  if (!dedupMap.has(item.fingerprint)) dedupMap.set(item.fingerprint, item);
}
const dedupFindings = Array.from(dedupMap.values()).sort((a, b) =>
  a.file.localeCompare(b.file) || a.line - b.line || a.text.localeCompare(b.text)
);

let baselineFingerprints = new Set();
if (fs.existsSync(baselinePath)) {
  try {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const arr = Array.isArray(baseline?.findings) ? baseline.findings : [];
    baselineFingerprints = new Set(arr.map((item) => String(item.fingerprint || '')));
  } catch {
    baselineFingerprints = new Set();
  }
}

const newFindings = dedupFindings.filter((item) => !baselineFingerprints.has(item.fingerprint));

const bySurface = new Map();
const byFile = new Map();
for (const item of dedupFindings) {
  bySurface.set(item.surface, (bySurface.get(item.surface) || 0) + 1);
  byFile.set(item.file, (byFile.get(item.file) || 0) + 1);
}

const report = {
  generated_at: new Date().toISOString(),
  scope: 'site_usage_language_visible_surfaces',
  strict_mode: strictMode,
  fail_on_new: failOnNew,
  baseline_path: baselinePath,
  totals: {
    files_scanned: files.length,
    finding_count: dedupFindings.length,
    new_finding_count: newFindings.length,
  },
  by_surface: Array.from(bySurface.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([surface, count]) => ({ surface, count })),
  by_file: Array.from(byFile.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 50)
    .map(([file, count]) => ({ file, count })),
  findings: dedupFindings,
  new_findings: newFindings,
};

fs.mkdirSync(artifactDir, { recursive: true });
const jsonPath = path.join(artifactDir, 'hardcoded-visible-strings-last.json');
const txtPath = path.join(artifactDir, 'hardcoded-visible-strings-last.txt');

const summaryLines = [
  'GEOVITO I18N HARDCODED VISIBLE STRINGS AUDIT',
  `generated_at=${report.generated_at}`,
  `files_scanned=${report.totals.files_scanned}`,
  `finding_count=${report.totals.finding_count}`,
  `new_finding_count=${report.totals.new_finding_count}`,
  `strict_mode=${strictMode ? '1' : '0'}`,
  `fail_on_new=${failOnNew ? '1' : '0'}`,
  'surface_distribution:',
  ...report.by_surface.map((item) => ` - ${item.surface}: ${item.count}`),
  'top_files:',
  ...report.by_file.slice(0, 20).map((item) => ` - ${item.file}: ${item.count}`),
];

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(txtPath, `${summaryLines.join('\n')}\n`, 'utf8');

console.log(`PASS: report written -> ${jsonPath}`);
console.log(`PASS: summary written -> ${txtPath}`);
console.log(`PASS: findings=${report.totals.finding_count}; new_findings=${report.totals.new_finding_count}`);

if (strictMode && report.totals.finding_count > 0) {
  console.error(`FAIL: hardcoded visible strings detected (${report.totals.finding_count})`);
  process.exit(20);
}

if (failOnNew && report.totals.new_finding_count > 0) {
  console.error(`FAIL: new hardcoded visible strings detected (${report.totals.new_finding_count})`);
  process.exit(21);
}

console.log('I18N HARDCODED VISIBLE STRINGS AUDIT: PASS');
