'use strict';

const MODEL_UID = 'api::user-preference.user-preference';
const { getCommunitySettings } = require('../../../modules/community-settings');
const DEFAULT_UI_LANGUAGE = 'en';
const LANGUAGE_PATTERN = /^[a-z]{2}(?:-[a-z0-9]{2,8})?$/i;
const DIGEST_OPTIONS = new Set(['off', 'instant', 'daily', 'weekly']);
const DEFAULT_NOTIFICATIONS_SITE_ENABLED = true;
const DEFAULT_NOTIFICATIONS_EMAIL_ENABLED = true;
const DEFAULT_NOTIFICATIONS_DIGEST = 'daily';
const ONBOARDING_KEYS = [
  'profile_completed',
  'first_place_selected',
  'first_post_started',
  'share_prompt_seen',
  'skipped',
];
const ONBOARDING_TRACKED_STEPS = ONBOARDING_KEYS.filter((key) => key !== 'skipped');
const DEFAULT_ONBOARDING_PROGRESS = Object.freeze({
  profile_completed: false,
  first_place_selected: false,
  first_post_started: false,
  share_prompt_seen: false,
  skipped: false,
});

const normalizeLanguage = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return LANGUAGE_PATTERN.test(normalized) ? normalized : null;
};

const hasOwn = (objectValue, key) => Object.prototype.hasOwnProperty.call(objectValue || {}, key);

const parseBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const normalizeDigest = (value, fallback = DEFAULT_NOTIFICATIONS_DIGEST) => {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase();
  return DIGEST_OPTIONS.has(normalized) ? normalized : fallback;
};

const parseOptionalBoolean = (payload, key) => {
  if (!hasOwn(payload, key)) return { present: false, value: null, valid: true };
  const value = payload[key];
  if (typeof value === 'boolean') return { present: true, value, valid: true };
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return { present: true, value: true, valid: true };
  if (['0', 'false', 'no', 'off'].includes(normalized)) return { present: true, value: false, valid: true };
  return { present: true, value: null, valid: false };
};

const parseOptionalDigest = (payload, key) => {
  if (!hasOwn(payload, key)) return { present: false, value: null, valid: true };
  const normalized = String(payload[key] || '')
    .trim()
    .toLowerCase();
  if (!DIGEST_OPTIONS.has(normalized)) {
    return { present: true, value: null, valid: false };
  }
  return { present: true, value: normalized, valid: true };
};

const parseOnboardingBoolean = (value) => {
  if (typeof value === 'boolean') return { valid: true, value };
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return { valid: true, value: true };
  if (['0', 'false', 'no', 'off'].includes(normalized)) return { valid: true, value: false };
  return { valid: false, value: null };
};

const parseOptionalOnboarding = (payload, key) => {
  if (!hasOwn(payload, key)) return { present: false, value: null, valid: true };

  const raw = payload[key];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { present: true, value: null, valid: false };
  }

  const entries = Object.entries(raw);
  if (entries.length === 0) {
    return { present: true, value: null, valid: false };
  }

  const patch = {};
  for (const [entryKey, entryValue] of entries) {
    if (!ONBOARDING_KEYS.includes(entryKey)) {
      return { present: true, value: null, valid: false };
    }
    const parsed = parseOnboardingBoolean(entryValue);
    if (!parsed.valid) {
      return { present: true, value: null, valid: false };
    }
    patch[entryKey] = parsed.value;
  }

  return { present: true, value: patch, valid: true };
};

const getUserId = (ctx) => {
  const rawId = ctx?.state?.user?.id;
  const parsed = Number(rawId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const findPreference = async (userId) => {
  const records = await strapi.entityService.findMany(MODEL_UID, {
    filters: { owner_user_id: userId },
    limit: 1,
  });

  if (!Array.isArray(records) || records.length === 0) return null;
  return records[0];
};

const getNotificationDefaults = async () => {
  const defaults = {
    notifications_site_enabled: DEFAULT_NOTIFICATIONS_SITE_ENABLED,
    notifications_email_enabled: DEFAULT_NOTIFICATIONS_EMAIL_ENABLED,
    notifications_digest: DEFAULT_NOTIFICATIONS_DIGEST,
  };

  try {
    const settings = await getCommunitySettings(strapi);
    const raw = settings?.notifications_defaults;
    if (!raw || typeof raw !== 'object') return defaults;

    return {
      notifications_site_enabled: parseBool(
        raw.notifications_site_enabled ?? raw.site_enabled ?? raw.site,
        defaults.notifications_site_enabled
      ),
      notifications_email_enabled: parseBool(
        raw.notifications_email_enabled ?? raw.email_enabled ?? raw.email,
        defaults.notifications_email_enabled
      ),
      notifications_digest: normalizeDigest(
        raw.notifications_digest ?? raw.digest,
        defaults.notifications_digest
      ),
    };
  } catch (_error) {
    return defaults;
  }
};

const normalizeOnboardingProgress = (value, fallback = DEFAULT_ONBOARDING_PROGRESS) => {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {
    profile_completed: parseBool(raw.profile_completed, fallback.profile_completed),
    first_place_selected: parseBool(raw.first_place_selected, fallback.first_place_selected),
    first_post_started: parseBool(raw.first_post_started, fallback.first_post_started),
    share_prompt_seen: parseBool(raw.share_prompt_seen, fallback.share_prompt_seen),
    skipped: parseBool(raw.skipped, fallback.skipped),
  };

  const completedSteps = ONBOARDING_TRACKED_STEPS.reduce((count, key) => {
    return count + (normalized[key] ? 1 : 0);
  }, 0);

  const totalSteps = ONBOARDING_TRACKED_STEPS.length;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const status = normalized.skipped
    ? 'skipped'
    : completedSteps >= totalSteps
      ? 'completed'
      : 'in_progress';

  return {
    ...normalized,
    completed_steps: completedSteps,
    total_steps: totalSteps,
    progress_percent: progressPercent,
    status,
  };
};

const mergeOnboardingProgress = (currentValue, patch = {}) => {
  const next = {
    profile_completed: parseBool(currentValue?.profile_completed, DEFAULT_ONBOARDING_PROGRESS.profile_completed),
    first_place_selected: parseBool(
      currentValue?.first_place_selected,
      DEFAULT_ONBOARDING_PROGRESS.first_place_selected
    ),
    first_post_started: parseBool(currentValue?.first_post_started, DEFAULT_ONBOARDING_PROGRESS.first_post_started),
    share_prompt_seen: parseBool(currentValue?.share_prompt_seen, DEFAULT_ONBOARDING_PROGRESS.share_prompt_seen),
    skipped: parseBool(currentValue?.skipped, DEFAULT_ONBOARDING_PROGRESS.skipped),
  };

  for (const key of ONBOARDING_KEYS) {
    if (hasOwn(patch, key)) {
      next[key] = patch[key] === true;
    }
  }

  return next;
};

const serializePreference = (preference, defaults, source = 'profile') => ({
  preferred_ui_language: preference?.preferred_ui_language || DEFAULT_UI_LANGUAGE,
  notifications_site_enabled: parseBool(
    preference?.notifications_site_enabled,
    defaults.notifications_site_enabled
  ),
  notifications_email_enabled: parseBool(
    preference?.notifications_email_enabled,
    defaults.notifications_email_enabled
  ),
  notifications_digest: normalizeDigest(
    preference?.notifications_digest,
    defaults.notifications_digest
  ),
  onboarding_progress: normalizeOnboardingProgress(preference?.onboarding_progress),
  source,
});

module.exports = {
  async getMe(ctx) {
    const userId = getUserId(ctx);
    if (!userId) return ctx.unauthorized('Authentication is required.');

    const preference = await findPreference(userId);
    const notificationDefaults = await getNotificationDefaults();

    ctx.body = {
      data: preference
        ? serializePreference(preference, notificationDefaults, 'profile')
        : serializePreference(null, notificationDefaults, 'default'),
    };
  },

  async upsertMe(ctx) {
    const userId = getUserId(ctx);
    if (!userId) return ctx.unauthorized('Authentication is required.');

    const payload = ctx.request.body?.data || ctx.request.body || {};
    const hasPreferredLanguage = hasOwn(payload, 'preferred_ui_language');
    const preferredLanguage = hasPreferredLanguage ? normalizeLanguage(payload.preferred_ui_language) : null;
    const notificationsSite = parseOptionalBoolean(payload, 'notifications_site_enabled');
    const notificationsEmail = parseOptionalBoolean(payload, 'notifications_email_enabled');
    const notificationsDigest = parseOptionalDigest(payload, 'notifications_digest');
    const onboardingProgress = parseOptionalOnboarding(payload, 'onboarding_progress');

    if (hasPreferredLanguage && !preferredLanguage) {
      return ctx.badRequest('preferred_ui_language is required and must be a valid language code.');
    }
    if (!notificationsSite.valid) {
      return ctx.badRequest('notifications_site_enabled must be a boolean.');
    }
    if (!notificationsEmail.valid) {
      return ctx.badRequest('notifications_email_enabled must be a boolean.');
    }
    if (!notificationsDigest.valid) {
      return ctx.badRequest('notifications_digest must be one of: off, instant, daily, weekly.');
    }
    if (!onboardingProgress.valid) {
      return ctx.badRequest(
        'onboarding_progress must be an object using boolean keys: profile_completed, first_place_selected, first_post_started, share_prompt_seen, skipped.'
      );
    }
    if (
      !hasPreferredLanguage &&
      !notificationsSite.present &&
      !notificationsEmail.present &&
      !notificationsDigest.present &&
      !onboardingProgress.present
    ) {
      return ctx.badRequest('No preference fields were provided.');
    }

    const existing = await findPreference(userId);
    const requestIp = ctx.request.ip || ctx.ip || 'unknown';
    const notificationDefaults = await getNotificationDefaults();

    if (existing?.id) {
      const updateData = {
        updated_from_ip: requestIp,
      };
      if (hasPreferredLanguage) {
        updateData.preferred_ui_language = preferredLanguage;
      }
      if (notificationsSite.present) {
        updateData.notifications_site_enabled = notificationsSite.value;
      }
      if (notificationsEmail.present) {
        updateData.notifications_email_enabled = notificationsEmail.value;
      }
      if (notificationsDigest.present) {
        updateData.notifications_digest = notificationsDigest.value;
      }
      if (onboardingProgress.present) {
        updateData.onboarding_progress = mergeOnboardingProgress(existing?.onboarding_progress, onboardingProgress.value);
      }

      const updated = await strapi.entityService.update(MODEL_UID, existing.id, {
        data: updateData,
      });

      ctx.body = {
        data: {
          id: updated.id,
          ...serializePreference(updated, notificationDefaults, 'profile'),
        },
      };
      return;
    }

    const created = await strapi.entityService.create(MODEL_UID, {
      data: {
        owner_user_id: userId,
        preferred_ui_language: hasPreferredLanguage ? preferredLanguage : DEFAULT_UI_LANGUAGE,
        notifications_site_enabled: notificationsSite.present
          ? notificationsSite.value
          : notificationDefaults.notifications_site_enabled,
        notifications_email_enabled: notificationsEmail.present
          ? notificationsEmail.value
          : notificationDefaults.notifications_email_enabled,
        notifications_digest: notificationsDigest.present
          ? notificationsDigest.value
          : notificationDefaults.notifications_digest,
        onboarding_progress: onboardingProgress.present
          ? mergeOnboardingProgress(DEFAULT_ONBOARDING_PROGRESS, onboardingProgress.value)
          : { ...DEFAULT_ONBOARDING_PROGRESS },
        updated_from_ip: requestIp,
      },
    });

    ctx.body = {
      data: {
        id: created.id,
        ...serializePreference(created, notificationDefaults, 'profile'),
      },
    };
  },
};
