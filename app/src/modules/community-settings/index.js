'use strict';

const UID = 'api::community-setting.community-setting';
const CACHE_TTL_MS = 30 * 1000;

const parseBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseIntValue = (value, fallback, min = 0, max = 1000) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const normalizeOpenMode = (value, fallback = 'controlled') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return normalized === 'open' ? 'open' : 'controlled';
};

const normalizeVisibility = (value, fallback = 'public') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (['public', 'members', 'private'].includes(normalized)) return normalized;
  return fallback;
};

const normalizeStrictness = (value, fallback = 'balanced') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (['lenient', 'balanced', 'strict'].includes(normalized)) return normalized;
  return fallback;
};

const defaultsFromEnv = () => {
  const guestLimit = parseIntValue(process.env.BLOG_COMMENT_GUEST_MAX_LINKS, 1, 0, 20);
  const memberLimit = parseIntValue(process.env.BLOG_COMMENT_MEMBER_MAX_LINKS, 2, 0, 20);
  const postLimit = parseIntValue(process.env.BLOG_POST_MAX_LINKS, 4, 0, 50);

  return {
    ugc_enabled: parseBool(process.env.UGC_ENABLED, true),
    ugc_open_mode: normalizeOpenMode(process.env.UGC_OPEN_MODE, 'controlled'),
    guest_comments_enabled: parseBool(process.env.GUEST_COMMENTS_ENABLED, true),
    post_links_enabled: parseBool(process.env.BLOG_POST_LINKS_ENABLED, true),
    comments_links_enabled: parseBool(process.env.BLOG_COMMENT_LINKS_ENABLED, true),
    post_link_limit: postLimit,
    member_comment_link_limit: memberLimit,
    guest_comment_link_limit: guestLimit,
    default_profile_visibility: normalizeVisibility(process.env.DEFAULT_PROFILE_VISIBILITY, 'public'),
    moderation_strictness: normalizeStrictness(process.env.MODERATION_STRICTNESS, 'balanced'),
    citizen_card_visible: parseBool(process.env.UGC_CITIZEN_CARD_ENABLED, true),
    badges_visible: parseBool(process.env.UGC_BADGES_VISIBLE, false),
    follow_system_enabled: parseBool(process.env.FOLLOW_SYSTEM_ENABLED, false),
    notifications_defaults: null,
    safety_notice_templates: null,
  };
};

const normalizeSettings = (value = {}) => {
  const defaults = defaultsFromEnv();
  const merged = {
    ...defaults,
    ...(value && typeof value === 'object' ? value : {}),
  };

  merged.ugc_enabled = parseBool(merged.ugc_enabled, defaults.ugc_enabled);
  merged.ugc_open_mode = normalizeOpenMode(merged.ugc_open_mode, defaults.ugc_open_mode);
  merged.guest_comments_enabled = parseBool(merged.guest_comments_enabled, defaults.guest_comments_enabled);
  merged.post_links_enabled = parseBool(merged.post_links_enabled, defaults.post_links_enabled);
  merged.comments_links_enabled = parseBool(merged.comments_links_enabled, defaults.comments_links_enabled);
  merged.post_link_limit = parseIntValue(merged.post_link_limit, defaults.post_link_limit, 0, 50);
  merged.member_comment_link_limit = parseIntValue(
    merged.member_comment_link_limit,
    defaults.member_comment_link_limit,
    0,
    20
  );
  merged.guest_comment_link_limit = parseIntValue(
    merged.guest_comment_link_limit,
    defaults.guest_comment_link_limit,
    0,
    20
  );
  merged.default_profile_visibility = normalizeVisibility(
    merged.default_profile_visibility,
    defaults.default_profile_visibility
  );
  merged.moderation_strictness = normalizeStrictness(merged.moderation_strictness, defaults.moderation_strictness);
  merged.citizen_card_visible = parseBool(merged.citizen_card_visible, defaults.citizen_card_visible);
  merged.badges_visible = parseBool(merged.badges_visible, defaults.badges_visible);
  merged.follow_system_enabled = parseBool(merged.follow_system_enabled, defaults.follow_system_enabled);
  merged.notifications_defaults =
    merged.notifications_defaults && typeof merged.notifications_defaults === 'object'
      ? merged.notifications_defaults
      : null;
  merged.safety_notice_templates =
    merged.safety_notice_templates && typeof merged.safety_notice_templates === 'object'
      ? merged.safety_notice_templates
      : null;

  return merged;
};

let cache = null;

const readRaw = async (strapi) => {
  try {
    const row = await strapi.db.query(UID).findOne({ where: {} });
    return row || null;
  } catch (_error) {
    return null;
  }
};

const getCommunitySettings = async (strapi, options = {}) => {
  const refresh = Boolean(options.refresh);
  const now = Date.now();

  if (!refresh && cache && cache.expiresAt > now) {
    return cache.value;
  }

  const raw = await readRaw(strapi);
  const normalized = normalizeSettings(raw);
  cache = {
    value: normalized,
    expiresAt: now + CACHE_TTL_MS,
  };

  return normalized;
};

const clearCommunitySettingsCache = () => {
  cache = null;
};

module.exports = {
  getCommunitySettings,
  clearCommunitySettingsCache,
  normalizeSettings,
};
