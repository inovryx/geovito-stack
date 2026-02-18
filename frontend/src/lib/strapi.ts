import type { LocalizedContent } from './languageState';
import { resolveStrapiBaseUrl, type StrapiEnv } from './strapiConfig';

export type AtlasPlace = {
  id: number;
  documentId?: string;
  place_id: string;
  place_type:
    | 'country'
    | 'admin1'
    | 'admin2'
    | 'admin3'
    | 'locality'
    | 'neighborhood'
    | 'street'
    | 'poi'
    | 'admin_area'
    | 'city'
    | 'district';
  slug?: string;
  parent_place_id?: string | null;
  country_code: string;
  region?: string | null;
  region_override?: string | null;
  editorial_notes?: string | null;
  admin_level?: number;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  canonical_language: 'en' | 'tr' | 'de' | 'es' | 'ru' | 'zh-cn';
  translations: LocalizedContent[];
  mock: boolean;
  parent?: {
    id: number;
    place_id: string;
  } | null;
  country_profile?: {
    id: number;
    country_code: string;
    label_mapping?: Record<string, string>;
    level_labels?: Record<string, string>;
    city_like_levels?: string[];
  } | null;
  region_groups?: Array<{
    id: number;
    region_key: string;
    country_code: string;
  }>;
};

export type BlogPost = {
  id: number;
  documentId?: string;
  post_id: string;
  canonical_language: 'en' | 'tr' | 'de' | 'es' | 'ru' | 'zh-cn';
  translations: LocalizedContent[];
  related_place_refs?: string[];
  related_places?: Array<{
    id: number;
    place_id: string;
  }>;
  published_on?: string;
  mock: boolean;
  tags?: string[];
};

export type UiPage = {
  id: number;
  documentId?: string;
  page_key: string;
  canonical_language: 'en' | 'tr' | 'de' | 'es' | 'ru' | 'zh-cn';
  translations: LocalizedContent[];
  mock: boolean;
};

export type RegionGroup = {
  id: number;
  documentId?: string;
  region_key: string;
  country_code: string;
  canonical_language: 'en' | 'tr' | 'de' | 'es' | 'ru' | 'zh-cn';
  translations: LocalizedContent[];
  mock: boolean;
  members?: AtlasPlace[];
  country_profile?: {
    id: number;
    country_code: string;
    city_like_levels?: string[];
    label_mapping?: Record<string, string>;
    level_labels?: Record<string, string>;
  } | null;
};

const STRAPI_ENV: StrapiEnv = {
  STRAPI_URL: import.meta.env.STRAPI_URL as string | undefined,
  PUBLIC_STRAPI_URL: import.meta.env.PUBLIC_STRAPI_URL as string | undefined,
  PUBLIC_SITE_URL: (import.meta.env.PUBLIC_SITE_URL as string | undefined) || process.env.PUBLIC_SITE_URL,
  CF_PAGES: process.env.CF_PAGES,
  NODE_ENV: process.env.NODE_ENV,
  ALLOW_LOCALHOST_STRAPI:
    process.env.ALLOW_LOCALHOST_STRAPI || (import.meta.env.ALLOW_LOCALHOST_STRAPI as string | undefined),
};

const STRAPI_URL = resolveStrapiBaseUrl(STRAPI_ENV);

const STRAPI_API_TOKEN = (import.meta.env.STRAPI_API_TOKEN as string | undefined) || '';
const CF_ACCESS_CLIENT_ID =
  process.env.CF_ACCESS_CLIENT_ID || (import.meta.env.CF_ACCESS_CLIENT_ID as string | undefined) || '';
const CF_ACCESS_CLIENT_SECRET =
  process.env.CF_ACCESS_CLIENT_SECRET || (import.meta.env.CF_ACCESS_CLIENT_SECRET as string | undefined) || '';
const CF_ACCESS_HEADERS_ENABLED = Boolean(CF_ACCESS_CLIENT_ID && CF_ACCESS_CLIENT_SECRET);
let atlasPlacesCachePromise: Promise<AtlasPlace[]> | null = null;
let regionGroupsCachePromise: Promise<RegionGroup[]> | null = null;

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, '');

const asEntity = <T extends Record<string, any>>(item: any): T => {
  if (!item) return item;
  if (item.attributes) {
    return {
      id: item.id,
      documentId: item.documentId,
      ...item.attributes,
    } as T;
  }
  return item as T;
};

const asEntityArray = <T extends Record<string, any>>(payload: any): T[] => {
  if (!payload?.data || !Array.isArray(payload.data)) return [];
  return payload.data.map((entry: any) => asEntity<T>(entry));
};

const asSingleEntity = <T extends Record<string, any>>(payload: any): T | null => {
  if (!payload?.data) return null;
  if (Array.isArray(payload.data)) {
    const first = payload.data[0];
    return first ? asEntity<T>(first) : null;
  }
  return asEntity<T>(payload.data);
};

const fetchJson = async (path: string, params: Record<string, string> = {}) => {
  const url = new URL(`${normalizeBaseUrl(STRAPI_URL)}${path}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (STRAPI_API_TOKEN) {
    headers.Authorization = `Bearer ${STRAPI_API_TOKEN}`;
  }

  if (CF_ACCESS_HEADERS_ENABLED) {
    headers['CF-Access-Client-Id'] = CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = CF_ACCESS_CLIENT_SECRET;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const bodySnippet = (await response.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ').trim();
    throw new Error(
      `Strapi request failed (${response.status}): ${url.toString()} ` +
        `${bodySnippet ? `body="${bodySnippet}"` : ''}`.trim() +
        ` access_headers=${CF_ACCESS_HEADERS_ENABLED ? 'on' : 'off'}`
    );
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    const bodySnippet = (await response.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ').trim();
    throw new Error(
      `Strapi response is not JSON (${contentType || 'unknown'}): ${url.toString()} ` +
        `${bodySnippet ? `body="${bodySnippet}"` : ''} ` +
        `access_headers=${CF_ACCESS_HEADERS_ENABLED ? 'on' : 'off'} ` +
        'If Cloudflare Access protects STRAPI_URL, set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET in Pages env.'
    );
  }

  return response.json();
};

export const getAtlasPlaces = async () => {
  if (!atlasPlacesCachePromise) {
    atlasPlacesCachePromise = (async () => {
      const payload = await fetchJson('/api/atlas-places', {
        'populate[0]': 'translations',
        'populate[1]': 'parent',
        'populate[2]': 'country_profile',
        'populate[3]': 'region_groups',
        'pagination[pageSize]': '400',
      });

      return asEntityArray<AtlasPlace>(payload);
    })();
  }

  return atlasPlacesCachePromise;
};

export const getRegionGroups = async () => {
  if (!regionGroupsCachePromise) {
    regionGroupsCachePromise = (async () => {
      const payload = await fetchJson('/api/region-groups', {
        'populate[0]': 'translations',
        'populate[1]': 'members',
        'populate[2]': 'members.translations',
        'populate[3]': 'members.parent',
        'populate[4]': 'members.country_profile',
        'populate[5]': 'country_profile',
        'pagination[pageSize]': '200',
      });

      return asEntityArray<RegionGroup>(payload);
    })();
  }

  return regionGroupsCachePromise;
};

export const getBlogPosts = async () => {
  const payload = await fetchJson('/api/blog-posts', {
    'populate[0]': 'translations',
    'populate[1]': 'related_places',
    'pagination[pageSize]': '200',
    'filters[publishedAt][$notNull]': 'true',
    sort: 'published_on:desc',
  });

  return asEntityArray<BlogPost>(payload);
};

export const getUiPage = async (pageKey: string) => {
  const payload = await fetchJson('/api/ui-pages', {
    'populate[0]': 'translations',
    'filters[page_key][$eq]': pageKey,
    'pagination[pageSize]': '1',
  });

  return asSingleEntity<UiPage>(payload);
};
