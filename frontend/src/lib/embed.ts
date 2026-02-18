import type { LocalizedEmbedItem } from './languageState';

export type ResolvedEmbed = {
  provider: 'youtube' | 'facebook';
  sourceUrl: string;
  embedUrl: string;
  title: string;
  caption: string;
};

const isBlank = (value: string | undefined | null) => !value || value.trim().length === 0;
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/;
const MAX_EMBEDS_PER_TRANSLATION = 8;

const ALLOWED_HOSTS: Record<ResolvedEmbed['provider'], Set<string>> = {
  youtube: new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be']),
  facebook: new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch', 'www.fb.watch']),
};

const parseUrl = (value: string) => {
  try {
    const parsed = new URL(value.trim());
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const normalizeHost = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/^\./, '')
    .replace(/\.$/, '');

const isAllowedHost = (provider: ResolvedEmbed['provider'], host: string) => {
  const normalizedHost = normalizeHost(host);
  const allowed = ALLOWED_HOSTS[provider];
  if (!allowed) return false;
  if (allowed.has(normalizedHost)) return true;

  for (const domain of allowed.values()) {
    if (normalizedHost.endsWith(`.${domain}`)) return true;
  }

  return false;
};

const extractYouTubeId = (url: URL) => {
  const host = normalizeHost(url.hostname);
  const path = url.pathname;

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    return path.split('/').filter(Boolean)[0] || '';
  }

  if (host.endsWith('youtube.com')) {
    if (path === '/watch') return url.searchParams.get('v') || '';
    if (path.startsWith('/shorts/')) return path.split('/').filter(Boolean)[1] || '';
    if (path.startsWith('/embed/')) return path.split('/').filter(Boolean)[1] || '';
  }

  return '';
};

const toYouTubeEmbedUrl = (sourceUrl: string, startSeconds?: number) => {
  const parsed = parseUrl(sourceUrl);
  if (!parsed) return null;
  if (!isAllowedHost('youtube', parsed.hostname)) return null;

  const videoId = extractYouTubeId(parsed);
  if (!YOUTUBE_ID_PATTERN.test(String(videoId || ''))) return null;

  const embedUrl = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
  embedUrl.searchParams.set('rel', '0');
  if (typeof startSeconds === 'number' && Number.isFinite(startSeconds) && startSeconds > 0) {
    embedUrl.searchParams.set('start', String(Math.floor(startSeconds)));
  }
  return embedUrl.toString();
};

const toFacebookEmbedUrl = (sourceUrl: string) => {
  const parsed = parseUrl(sourceUrl);
  if (!parsed) return null;
  if (!isAllowedHost('facebook', parsed.hostname)) return null;
  if (!parsed.pathname || parsed.pathname === '/') return null;

  const embedUrl = new URL('https://www.facebook.com/plugins/video.php');
  embedUrl.searchParams.set('href', parsed.toString());
  embedUrl.searchParams.set('show_text', 'false');
  embedUrl.searchParams.set('width', '560');
  return embedUrl.toString();
};

const resolveEmbedUrl = (embed: LocalizedEmbedItem) => {
  if (embed.provider === 'youtube') {
    return toYouTubeEmbedUrl(embed.source_url, embed.start_seconds);
  }
  if (embed.provider === 'facebook') {
    return toFacebookEmbedUrl(embed.source_url);
  }
  return null;
};

export const resolveEmbeds = (embeds: LocalizedEmbedItem[] | undefined | null): ResolvedEmbed[] => {
  if (!Array.isArray(embeds) || embeds.length === 0) return [];

  const output: ResolvedEmbed[] = [];
  const dedupe = new Set<string>();

  for (const entry of embeds) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.provider !== 'youtube' && entry.provider !== 'facebook') continue;
    if (isBlank(entry.source_url)) continue;

    const embedUrl = resolveEmbedUrl(entry);
    if (!embedUrl) continue;

    const dedupeKey = `${entry.provider}:${embedUrl}`;
    if (dedupe.has(dedupeKey)) continue;
    dedupe.add(dedupeKey);

    const source = parseUrl(entry.source_url);
    if (!source) continue;

    output.push({
      provider: entry.provider,
      sourceUrl: source.toString(),
      embedUrl,
      title: isBlank(entry.title) ? entry.provider.toUpperCase() : String(entry.title).trim(),
      caption: isBlank(entry.caption) ? '' : String(entry.caption).trim(),
    });

    if (output.length >= MAX_EMBEDS_PER_TRANSLATION) break;
  }

  return output;
};
