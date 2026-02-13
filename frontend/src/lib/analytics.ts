import { EVENT_PROP_WHITELIST, PROP_SANITIZERS, isEventName, type EventName } from './analytics/schema';
import { getConsent } from './consent';

export type AnalyticsProps = Record<string, unknown>;

type AnalyticsProvider = 'console' | 'datalayer' | 'custom';

type SanitizedValue = string | number | boolean;
type SanitizedProps = Record<string, SanitizedValue>;

type GeoVitoEvent = {
  event: EventName;
  props: SanitizedProps;
  ts: string;
};

declare global {
  interface Window {
    dataLayer?: Array<unknown>;
    __gvEvents?: GeoVitoEvent[];
    __gvTrack?: (eventName: string, props?: AnalyticsProps) => void;
    __gvIdentify?: (userId?: string, traits?: AnalyticsProps) => void;
  }
}

const ANALYTICS_ENABLED = import.meta.env.PUBLIC_ANALYTICS_ENABLED === 'true';
const ANALYTICS_DEBUG = import.meta.env.PUBLIC_ANALYTICS_DEBUG === 'true';
const DEDUPE_WINDOW_MS = 800;
const SIGNATURE_TTL_MS = 10_000;
const PII_KEY_PATTERN = /(email|phone|user.?id|name|address|token|session|cookie|password|passwd|jwt|auth)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?\d[\d().\-\s]{7,}\d)\b/g;

const EVENT_THROTTLE_MS: Partial<Record<EventName, number>> = {
  sort_change: 600,
  ad_slot_view: 900,
};

const recentSignatures = new Map<string, number>();
const lastEventAt = new Map<EventName, number>();
const seenAdSlotIds = new Set<string>();

const rawProvider = String(import.meta.env.PUBLIC_ANALYTICS_PROVIDER || 'console').toLowerCase();
const ANALYTICS_PROVIDER: AnalyticsProvider =
  rawProvider === 'datalayer' || rawProvider === 'custom' || rawProvider === 'console'
    ? rawProvider
    : 'console';

const canUseWindow = () => typeof window !== 'undefined';
const shouldBuffer = () => ANALYTICS_ENABLED || ANALYTICS_DEBUG;

const ensureBuffer = () => {
  if (!canUseWindow()) return null;
  if (!window.__gvEvents) {
    window.__gvEvents = [];
  }
  return window.__gvEvents;
};

const pushBufferedEvent = (eventName: EventName, props: SanitizedProps) => {
  if (!shouldBuffer()) return;
  const buffer = ensureBuffer();
  if (!buffer) return;
  buffer.push({
    event: eventName,
    props,
    ts: new Date().toISOString(),
  });
};

const debugLog = (kind: string, payload: unknown) => {
  if (!ANALYTICS_DEBUG || !canUseWindow()) return;
  console.log('[analytics]', kind, payload);
};

const readDocumentLanguage = () => {
  if (!canUseWindow()) return 'en';
  return String(document.documentElement.lang || 'en');
};

const hasAnalyticsConsent = () => {
  if (!canUseWindow()) return false;

  const fromDocument = document.documentElement.getAttribute('data-consent-analytics');
  if (fromDocument === '1') return true;
  if (fromDocument === '0') return false;

  return getConsent()?.analytics === true;
};

const toSafeLang = (value: unknown) => {
  const sanitized = PROP_SANITIZERS.lang?.(value);
  if (typeof sanitized === 'string') return sanitized;
  return 'en';
};

export const redactPIIStrings = (value: string) => {
  return value
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(PHONE_PATTERN, '[redacted-phone]');
};

const sanitizePropValue = (key: string, value: unknown) => {
  const sanitizer = PROP_SANITIZERS[key];
  if (!sanitizer) return undefined;

  const sanitized = sanitizer(value);
  if (typeof sanitized === 'string') {
    const compact = redactPIIStrings(sanitized);
    return compact || undefined;
  }
  if (typeof sanitized === 'number' || typeof sanitized === 'boolean') {
    return sanitized;
  }
  return undefined;
};

const hasPotentialPiiKey = (key: string) => PII_KEY_PATTERN.test(key);

const asObject = (value: unknown): AnalyticsProps => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as AnalyticsProps;
};

const toSignature = (eventName: EventName, props: SanitizedProps) => {
  const sortedEntries = Object.entries(props).sort(([left], [right]) => left.localeCompare(right));
  return `${eventName}:${JSON.stringify(sortedEntries)}`;
};

const pruneSignatureCache = (now: number) => {
  for (const [signature, createdAt] of recentSignatures) {
    if (now - createdAt > SIGNATURE_TTL_MS) {
      recentSignatures.delete(signature);
    }
  }
};

const isThrottled = (eventName: EventName, now: number) => {
  const windowMs = EVENT_THROTTLE_MS[eventName];
  if (!windowMs) return false;

  const last = lastEventAt.get(eventName) || 0;
  if (now - last < windowMs) return true;

  lastEventAt.set(eventName, now);
  return false;
};

const isDuplicateSignature = (eventName: EventName, props: SanitizedProps, now: number) => {
  pruneSignatureCache(now);
  const signature = toSignature(eventName, props);
  const previous = recentSignatures.get(signature);

  if (previous && now - previous < DEDUPE_WINDOW_MS) {
    return true;
  }

  recentSignatures.set(signature, now);
  return false;
};

const hasSeenAdSlot = (props: SanitizedProps) => {
  const slotId = props.slotId;
  if (typeof slotId !== 'string') return false;
  if (seenAdSlotIds.has(slotId)) return true;
  seenAdSlotIds.add(slotId);
  return false;
};

export const sanitizeProps = (eventName: EventName, props: AnalyticsProps = {}): SanitizedProps => {
  const payload = asObject(props);
  const allowList = EVENT_PROP_WHITELIST[eventName] || [];
  const sanitized: SanitizedProps = {};

  for (const key of allowList) {
    if (hasPotentialPiiKey(key)) continue;
    if (!(key in payload)) continue;

    const safeValue = sanitizePropValue(key, payload[key]);
    if (safeValue !== undefined) {
      sanitized[key] = safeValue;
    }
  }

  sanitized.lang = toSafeLang(payload.lang || readDocumentLanguage());
  return sanitized;
};

const dispatchEvent = (eventName: EventName, props: SanitizedProps) => {
  if (ANALYTICS_PROVIDER === 'datalayer') {
    window.dataLayer = window.dataLayer || [];
    const payload = { event: eventName, ...props };
    window.dataLayer.push(payload);
    if (ANALYTICS_DEBUG) {
      console.log('[analytics]', 'dataLayer.push', payload);
    }
    return;
  }

  if (ANALYTICS_PROVIDER === 'console') {
    console.log('[analytics]', eventName, props);
    return;
  }

  window.dispatchEvent(
    new CustomEvent('gv:analytics', {
      detail: {
        event: eventName,
        props,
      },
    })
  );
};

export const track = (eventName: string, props: AnalyticsProps = {}) => {
  if (!eventName || !canUseWindow()) return;
  if (!isEventName(eventName)) return;
  if (eventName.length > 40) return;
  if (!ANALYTICS_ENABLED) return;
  if (!hasAnalyticsConsent()) return;

  const sanitized = sanitizeProps(eventName, props);
  const now = Date.now();

  if (eventName === 'ad_slot_view' && hasSeenAdSlot(sanitized)) return;
  if (isThrottled(eventName, now)) return;
  if (isDuplicateSignature(eventName, sanitized, now)) return;

  pushBufferedEvent(eventName, sanitized);

  dispatchEvent(eventName, sanitized);
  debugLog(eventName, sanitized);
};

export const trackSearchSubmit = (props: {
  query?: unknown;
  type?: unknown;
  location?: unknown;
  lang?: unknown;
}) => track('search_submit', props);

export const trackChipClick = (props: {
  group?: unknown;
  value?: unknown;
  lang?: unknown;
}) => track('filter_chip_click', props);

export const trackSortChange = (props: {
  context?: unknown;
  value?: unknown;
  lang?: unknown;
}) => track('sort_change', props);

export const trackPaginationClick = (props: {
  context?: unknown;
  action?: unknown;
  page?: unknown;
  lang?: unknown;
}) => track('pagination_click', props);

export const trackToolOpen = (props: {
  tool?: unknown;
  context?: unknown;
  lang?: unknown;
}) => track('tool_open', props);

export const trackNavClick = (props: {
  item?: unknown;
  lang?: unknown;
}) => track('nav_click', props);

export const trackAdSlotView = (props: {
  slotId?: unknown;
  context?: unknown;
  lang?: unknown;
}) => track('ad_slot_view', props);

export const trackThemeToggle = (props: {
  to?: unknown;
  lang?: unknown;
}) => track('theme_toggle', props);

export const trackSidebarToggle = (props: {
  to?: unknown;
  lang?: unknown;
}) => track('sidebar_toggle', props);

export const identify = (userId?: string, traits: AnalyticsProps = {}) => {
  // Placeholder API: intentionally no-op for now.
  if (!canUseWindow()) return;
  if (ANALYTICS_DEBUG) {
    debugLog('identify', {
      userId: userId || null,
      traits: asObject(traits),
    });
  }
};
