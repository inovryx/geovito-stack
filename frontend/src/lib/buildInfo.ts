const readDataset = (key: 'buildSha' | 'buildBranch' | 'cfPages') => {
  if (typeof document === 'undefined') return '';
  const value = document.documentElement?.dataset?.[key];
  return typeof value === 'string' ? value.trim() : '';
};

const toBool = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const publicBuildSha = String(import.meta.env.PUBLIC_BUILD_SHA || '').trim();
const publicBuildBranch = String(import.meta.env.PUBLIC_BUILD_BRANCH || '').trim();
const publicIsCfPages = String(import.meta.env.PUBLIC_IS_CF_PAGES || '').trim();
const sentryReleaseFallback = String(import.meta.env.PUBLIC_SENTRY_RELEASE || '').trim();

export const BUILD_SHA = publicBuildSha || readDataset('buildSha') || sentryReleaseFallback;
export const BUILD_BRANCH = publicBuildBranch || readDataset('buildBranch');
export const IS_CF_PAGES = publicIsCfPages ? toBool(publicIsCfPages) : toBool(readDataset('cfPages'));
