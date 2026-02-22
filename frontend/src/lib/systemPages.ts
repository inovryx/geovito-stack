export const SYSTEM_PAGES = ['about', 'rules', 'help'] as const;
// Keep system page keys stable for URL permanence: /:lang/:pageKey

export type SystemSlug = (typeof SYSTEM_PAGES)[number];

export const isSystemSlug = (value: string): value is SystemSlug =>
  SYSTEM_PAGES.includes(value as SystemSlug);
