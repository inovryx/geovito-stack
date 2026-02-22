'use strict';

const SUPPORTED_PROVIDERS = Object.freeze(['youtube', 'facebook']);
const PROVIDER_SET = new Set(SUPPORTED_PROVIDERS);

const PROVIDER_HOSTS = Object.freeze({
  youtube: new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be']),
  facebook: new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch', 'www.fb.watch']),
});

const MAX_EMBEDS_PER_TRANSLATION = 8;
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/;

const isBlank = (value) => typeof value !== 'string' || value.trim().length === 0;

const normalizeText = (value, maxLength) => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
};

const normalizeProvider = (value) => String(value || '').trim().toLowerCase();

const toUrl = (value, context) => {
  try {
    const parsed = new URL(String(value || '').trim());
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new Error('only http/https protocols are allowed');
    }
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    return parsed;
  } catch (error) {
    throw new Error(`${context}: source_url must be a valid absolute URL (${error.message})`);
  }
};

const normalizeHostname = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/^\./, '')
    .replace(/\.$/, '');

const isHostAllowed = (provider, hostname) => {
  const allowed = PROVIDER_HOSTS[provider];
  if (!allowed) return false;
  const normalizedHost = normalizeHostname(hostname);
  if (allowed.has(normalizedHost)) return true;

  for (const domain of allowed.values()) {
    if (normalizedHost.endsWith(`.${domain}`)) return true;
  }
  return false;
};

const normalizeStartSeconds = (value, context) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 86400) {
    throw new Error(`${context}: start_seconds must be an integer between 0 and 86400`);
  }
  return parsed;
};

const extractYouTubeId = (url) => {
  const host = normalizeHostname(url.hostname);
  const path = String(url.pathname || '');
  const segments = path.split('/').filter(Boolean);

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    return segments[0] || '';
  }

  if (host.endsWith('youtube.com')) {
    if (path === '/watch') return url.searchParams.get('v') || '';
    if (path.startsWith('/shorts/')) return segments[1] || '';
    if (path.startsWith('/embed/')) return segments[1] || '';
  }

  return '';
};

const assertProviderSpecificUrl = (provider, parsedUrl, context) => {
  if (provider === 'youtube') {
    const videoId = extractYouTubeId(parsedUrl);
    if (!YOUTUBE_ID_PATTERN.test(String(videoId || ''))) {
      throw new Error(`${context}: youtube source_url must reference a valid video id`);
    }
    return;
  }

  if (provider === 'facebook') {
    const path = String(parsedUrl.pathname || '').trim();
    if (!path || path === '/') {
      throw new Error(`${context}: facebook source_url must reference a concrete post/video path`);
    }
  }
};

const normalizeEmbedItem = (embed, contextLabel, index) => {
  const context = `${contextLabel}.embeds[${index}]`;
  if (!embed || typeof embed !== 'object') {
    throw new Error(`${context}: embed item must be an object`);
  }

  const provider = normalizeProvider(embed.provider);
  if (!PROVIDER_SET.has(provider)) {
    throw new Error(`${context}: provider must be one of ${SUPPORTED_PROVIDERS.join(', ')}`);
  }

  const sourceUrlRaw = embed.source_url || embed.url;
  if (isBlank(sourceUrlRaw)) {
    throw new Error(`${context}: source_url is required`);
  }

  const parsedUrl = toUrl(sourceUrlRaw, context);
  if (!isHostAllowed(provider, parsedUrl.hostname)) {
    throw new Error(`${context}: source_url host is not allowed for provider=${provider}`);
  }
  assertProviderSpecificUrl(provider, parsedUrl, context);

  return {
    provider,
    source_url: parsedUrl.toString(),
    title: normalizeText(embed.title, 140),
    caption: normalizeText(embed.caption, 280),
    start_seconds: normalizeStartSeconds(embed.start_seconds, context),
  };
};

const normalizeEmbedsForTranslation = (translation, contextLabel, translationIndex) => {
  if (!translation || typeof translation !== 'object') return translation;
  if (!Array.isArray(translation.embeds)) return translation;

  if (translation.embeds.length > MAX_EMBEDS_PER_TRANSLATION) {
    throw new Error(
      `${contextLabel}.translations[${translationIndex}].embeds exceeds max ${MAX_EMBEDS_PER_TRANSLATION}`
    );
  }

  translation.embeds = translation.embeds.map((embed, embedIndex) =>
    normalizeEmbedItem(embed, `${contextLabel}.translations[${translationIndex}]`, embedIndex)
  );

  return translation;
};

const normalizeEmbedsForTranslations = (translations, options = {}) => {
  if (!Array.isArray(translations)) return translations;
  const contextLabel = options.contextLabel || 'entry';

  for (let index = 0; index < translations.length; index += 1) {
    const translation = translations[index];

    // When Strapi passes component references during internal writes we skip normalization.
    if (translation && typeof translation === 'object' && 'id' in translation && !('language' in translation)) {
      continue;
    }

    normalizeEmbedsForTranslation(translation, contextLabel, index);
  }

  return translations;
};

module.exports = {
  SUPPORTED_PROVIDERS,
  normalizeEmbedsForTranslations,
};
