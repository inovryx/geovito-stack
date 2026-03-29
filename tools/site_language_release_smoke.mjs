import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.env.ROOT_DIR || process.cwd();
const artifactDir = process.env.ARTIFACT_DIR || path.join(rootDir, 'artifacts', 'i18n');

const registryPath = path.join(rootDir, 'frontend', 'src', 'config', 'site-language-release-registry.json');
const languageSwitcherPath = path.join(rootDir, 'frontend', 'src', 'components', 'LanguageSwitcher.astro');
const pageHelpersPath = path.join(rootDir, 'frontend', 'src', 'lib', 'pageHelpers.ts');
const baseLayoutPath = path.join(rootDir, 'frontend', 'src', 'layouts', 'BaseLayout.astro');
const sitemapPath = path.join(rootDir, 'frontend', 'src', 'lib', 'sitemap.ts');
const aliasRedirectPath = path.join(rootDir, 'frontend', 'src', 'pages', '@[username].ts');

const REQUIRED_STATES = new Set(['registered', 'review', 'released', 'hidden']);
const REQUIRED_RELEASED_DEFAULTS = ['en', 'tr', 'fr'];

const checks = [];
const addCheck = (ok, name, detail) => {
  checks.push({ ok: Boolean(ok), name, detail: String(detail || '') });
};

const fileExists = (file) => fs.existsSync(file) && fs.statSync(file).isFile();

const readUtf8 = (file) => fs.readFileSync(file, 'utf8');

const assertPattern = (file, pattern, name, detail) => {
  const source = readUtf8(file);
  addCheck(pattern.test(source), name, detail);
};

for (const file of [registryPath, languageSwitcherPath, pageHelpersPath, baseLayoutPath, sitemapPath, aliasRedirectPath]) {
  addCheck(fileExists(file), `file_exists:${path.relative(rootDir, file)}`, file);
}

let registry = null;
try {
  registry = JSON.parse(readUtf8(registryPath));
  addCheck(true, 'registry_json_parse', registryPath);
} catch (error) {
  addCheck(false, 'registry_json_parse', `${registryPath} :: ${error instanceof Error ? error.message : String(error)}`);
}

const released = [];
const unreleased = [];
const uniqueCodes = new Set();

if (registry && Array.isArray(registry.languages)) {
  for (const row of registry.languages) {
    const code = String(row?.code || '').trim().toLowerCase();
    const state = String(row?.state || '').trim().toLowerCase();
    if (!code) continue;

    addCheck(REQUIRED_STATES.has(state), `registry_state_valid:${code}`, `state=${state}`);

    if (uniqueCodes.has(code)) {
      addCheck(false, `registry_unique_code:${code}`, 'duplicate code');
      continue;
    }
    uniqueCodes.add(code);

    if (state === 'released') {
      released.push(code);
    } else {
      unreleased.push(code);
    }
  }

  addCheck(released.length > 0, 'registry_released_non_empty', `released=${released.join(',')}`);

  for (const code of REQUIRED_RELEASED_DEFAULTS) {
    addCheck(released.includes(code), `registry_default_released:${code}`, `released=${released.join(',')}`);
  }

  const explicitDefault = String(registry.default_public_language || '').trim().toLowerCase();
  addCheck(released.includes(explicitDefault), 'registry_default_public_is_released', `default_public_language=${explicitDefault}`);
} else {
  addCheck(false, 'registry_languages_array', 'languages[] missing');
}

assertPattern(
  languageSwitcherPath,
  /const\s+releasedLanguages\s*=\s*PUBLIC_RELEASED_SITE_UI_LANGUAGES\s*;/,
  'selector_uses_public_released_set',
  'LanguageSwitcher only exposes released set by default'
);

assertPattern(
  languageSwitcherPath,
  /data-site-language-preview-only/,
  'selector_preview_nodes_exist',
  'Preview-only unreleased language nodes are hidden by default'
);

assertPattern(
  pageHelpersPath,
  /for\s*\(const\s+language\s+of\s+PUBLIC_RELEASED_SITE_UI_LANGUAGES\)/,
  'language_links_use_released_set',
  'buildLanguageLinks/toAlternates should use released languages'
);

assertPattern(
  baseLayoutPath,
  /const\s+effectiveCanonical\s*=\s*currentLanguageReleased\s*\?/,
  'canonical_guard_present',
  'Unreleased routes should rewrite canonical to released fallback'
);

assertPattern(
  baseLayoutPath,
  /data-site-language-released=/,
  'layout_release_flag_present',
  'Layout exposes release flag for runtime guard'
);

assertPattern(
  baseLayoutPath,
  /data-site-language-preview-mode/,
  'layout_preview_mode_present',
  'Preview mode signal exists'
);

assertPattern(
  sitemapPath,
  /isPublicReleasedLanguage/,
  'sitemap_release_filter_present',
  'Sitemap language generation is filtered by released state'
);

assertPattern(
  aliasRedirectPath,
  /resolvePublicLanguage|DEFAULT_PUBLIC_LANGUAGE/,
  'alias_redirect_uses_public_language',
  '/@username redirect resolves to released language set'
);

const ok = checks.every((entry) => entry.ok);

const report = {
  generated_at: new Date().toISOString(),
  scope: 'site_language_release_kill_switch',
  registry: {
    released,
    unreleased,
  },
  checks,
  totals: {
    passed: checks.filter((entry) => entry.ok).length,
    failed: checks.filter((entry) => !entry.ok).length,
  },
  status: ok ? 'PASS' : 'FAIL',
};

fs.mkdirSync(artifactDir, { recursive: true });
const jsonPath = path.join(artifactDir, 'site-language-release-smoke-last.json');
const txtPath = path.join(artifactDir, 'site-language-release-smoke-last.txt');

const lines = [
  'GEOVITO SITE LANGUAGE RELEASE SMOKE',
  `generated_at=${report.generated_at}`,
  `released=${released.join(',') || '-'}`,
  `unreleased=${unreleased.join(',') || '-'}`,
  ...checks.map((entry) => `${entry.ok ? 'PASS' : 'FAIL'}: ${entry.name}${entry.detail ? ` (${entry.detail})` : ''}`),
  `status=${report.status}`,
];

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(txtPath, `${lines.join('\n')}\n`, 'utf8');

console.log(`PASS: report written -> ${jsonPath}`);
console.log(`PASS: summary written -> ${txtPath}`);
console.log(`PASS: checks total=${checks.length}`);
console.log(`${report.status === 'PASS' ? 'SITE LANGUAGE RELEASE SMOKE: PASS' : 'SITE LANGUAGE RELEASE SMOKE: FAIL'}`);

if (!ok) {
  process.exit(41);
}
