'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');

const isTrue = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const firstEnvValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (isNonEmptyString(value)) return value.trim();
  }
  return '';
};

const normalizeCallbackPath = (value, fallback) => {
  const raw = String(value || fallback || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    return parsed.pathname.replace(/^\/+/, '');
  } catch (_error) {
    return raw.replace(/^\/+/, '');
  }
};

const parseScope = (value, fallback) => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
};

const serialize = (value) => JSON.stringify(value, null, 2);
const clone = (value) => JSON.parse(JSON.stringify(value));

const createAppInstance = async () => {
  const app = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });
  await app.load();
  return app;
};

const providerSpecs = [
  {
    name: 'google',
    icon: 'google',
    enabled: isTrue(process.env.AUTH_GOOGLE_ENABLED, false),
    key: firstEnvValue('AUTH_GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_KEY'),
    secret: firstEnvValue('AUTH_GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET'),
    callbackPath: normalizeCallbackPath(process.env.AUTH_GOOGLE_CALLBACK_PATH, 'api/connect/google/callback'),
    scope: parseScope(process.env.AUTH_GOOGLE_SCOPE, ['email']),
  },
  {
    name: 'facebook',
    icon: 'facebook-square',
    enabled: isTrue(process.env.AUTH_FACEBOOK_ENABLED, false),
    key: firstEnvValue('AUTH_FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_KEY'),
    secret: firstEnvValue('AUTH_FACEBOOK_CLIENT_SECRET', 'FACEBOOK_CLIENT_SECRET'),
    callbackPath: normalizeCallbackPath(process.env.AUTH_FACEBOOK_CALLBACK_PATH, 'api/connect/facebook/callback'),
    scope: parseScope(process.env.AUTH_FACEBOOK_SCOPE, ['email']),
  },
];

const validateProviderPayload = (name, provider) => {
  const errors = [];
  if (provider.enabled && !isNonEmptyString(provider.key)) {
    errors.push(`${name}: enabled but client id is empty (AUTH_${name.toUpperCase()}_CLIENT_ID)`);
  }
  if (provider.enabled && !isNonEmptyString(provider.secret)) {
    errors.push(`${name}: enabled but client secret is empty (AUTH_${name.toUpperCase()}_CLIENT_SECRET)`);
  }
  if (!isNonEmptyString(provider.callbackUrl)) {
    errors.push(`${name}: callback path is empty`);
  }
  return errors;
};

const mergeProviderConfig = (existing, spec) => {
  const merged = {
    ...(existing || {}),
    icon: spec.icon,
    enabled: spec.enabled,
    callbackUrl: spec.callbackPath,
    scope: spec.scope,
  };

  if (isNonEmptyString(spec.key)) merged.key = spec.key;
  if (isNonEmptyString(spec.secret)) merged.secret = spec.secret;
  return merged;
};

const printSummary = (label, provider) => {
  const status = provider.enabled ? 'enabled' : 'disabled';
  const keyState = isNonEmptyString(provider.key) ? 'set' : 'empty';
  const secretState = isNonEmptyString(provider.secret) ? 'set' : 'empty';
  const scope = Array.isArray(provider.scope) ? provider.scope.join(',') : '';
  console.log(
    `- ${label}: ${status} | key=${keyState} | secret=${secretState} | callback=${provider.callbackUrl} | scope=${scope}`
  );
};

const run = async () => {
  const dryRun = process.argv.includes('--dry-run');
  const strapi = await createAppInstance();

  try {
    const pluginStore = strapi.store({ type: 'plugin', name: 'users-permissions' });
    const currentGrant = (await pluginStore.get({ key: 'grant' })) || {};
    const nextGrant = clone(currentGrant);
    const errors = [];

    for (const spec of providerSpecs) {
      const currentProvider = currentGrant[spec.name] || {};
      const mergedProvider = mergeProviderConfig(currentProvider, spec);
      errors.push(...validateProviderPayload(spec.name, mergedProvider));
      nextGrant[spec.name] = mergedProvider;
    }

    if (errors.length > 0) {
      console.error('OAuth provider configuration aborted:');
      for (const error of errors) {
        console.error(`  - ${error}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(`OAuth provider apply mode: ${dryRun ? 'dry-run' : 'apply'}`);
    printSummary('google', nextGrant.google || {});
    printSummary('facebook', nextGrant.facebook || {});

    if (serialize(currentGrant) === serialize(nextGrant)) {
      console.log('No changes detected in users-permissions grant store.');
      return;
    }

    if (dryRun) {
      console.log('Dry-run complete. No database changes were written.');
      return;
    }

    await pluginStore.set({ key: 'grant', value: nextGrant });
    console.log('users-permissions grant store updated successfully.');
  } finally {
    await strapi.destroy();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
