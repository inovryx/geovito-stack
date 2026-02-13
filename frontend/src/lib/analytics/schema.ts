// GTM/GA4 setup note:
// Create GA4 Event tags in GTM for:
// search_submit, filter_chip_click, sort_change, pagination_click, tool_open,
// nav_click, theme_toggle, sidebar_toggle, ad_slot_view (when ads tracking is enabled).
export const EVENT_NAMES = [
  'search_submit',
  'filter_chip_click',
  'sort_change',
  'pagination_click',
  'tool_open',
  'nav_click',
  'ad_slot_view',
  'theme_toggle',
  'sidebar_toggle',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export const EVENT_PROP_WHITELIST: Record<EventName, string[]> = {
  search_submit: ['query', 'type', 'location', 'lang'],
  filter_chip_click: ['group', 'value', 'lang'],
  sort_change: ['context', 'value', 'lang'],
  pagination_click: ['context', 'action', 'page', 'lang'],
  tool_open: ['tool', 'context', 'lang'],
  nav_click: ['item', 'lang'],
  ad_slot_view: ['slotId', 'context', 'lang'],
  theme_toggle: ['to', 'lang'],
  sidebar_toggle: ['to', 'lang'],
};

const toSafeString = (value: unknown, maxLength = 80) => {
  if (typeof value !== 'string') return undefined;
  const compact = value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!compact) return undefined;
  return compact.slice(0, maxLength);
};

const toSafeNumber = (value: unknown, min = -1_000_000, max = 1_000_000) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const normalized = Math.round(value);
  return Math.min(max, Math.max(min, normalized));
};

const toSafeLang = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const compact = value.toLowerCase().replace(/[^a-z0-9-]/g, '').trim();
  if (compact.length < 2) return undefined;
  return compact.slice(0, 10);
};

const toStrictBoolean = (value: unknown) => {
  if (typeof value !== 'boolean') return undefined;
  return value;
};

export const PROP_SANITIZERS: Record<string, (value: unknown) => string | number | boolean | undefined> = {
  query: (value) => toSafeString(value, 120),
  type: (value) => toSafeString(value, 32),
  location: (value) => toSafeString(value, 24),
  group: (value) => toSafeString(value, 24),
  value: (value) => toSafeString(value, 80),
  context: (value) => toSafeString(value, 32),
  action: (value) => toSafeString(value, 16),
  page: (value) => toSafeNumber(value, 1, 9_999),
  tool: (value) => toSafeString(value, 24),
  item: (value) => toSafeString(value, 40),
  slotId: (value) => toSafeString(value, 40),
  to: (value) => toSafeString(value, 16),
  lang: toSafeLang,
  enabled: toStrictBoolean,
};

const EVENT_NAME_SET = new Set<string>(EVENT_NAMES);

export const isEventName = (value: string): value is EventName => EVENT_NAME_SET.has(value);
