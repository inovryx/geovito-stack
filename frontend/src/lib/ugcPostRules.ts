import { DEFAULT_LANGUAGE, pathForLanguage, type SiteLanguage } from './languages';
import { resolveTranslation, type LocalizedContent } from './languageState';

type UgcLikePost = {
  content_source?: 'editorial' | 'user';
  submission_state?: 'draft' | 'submitted' | 'approved' | 'rejected' | 'spam' | 'deleted' | string | null;
  site_visibility?: 'visible' | 'hidden' | string | null;
  mock?: boolean;
};

const SUBMISSION_STATE_SET = new Set(['draft', 'submitted', 'approved', 'rejected', 'spam', 'deleted']);
const HIDDEN_STATE_SET = new Set(['rejected', 'spam', 'deleted']);

export const normalizeSubmissionState = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!SUBMISSION_STATE_SET.has(normalized)) return 'approved';
  return normalized as 'draft' | 'submitted' | 'approved' | 'rejected' | 'spam' | 'deleted';
};

export const normalizeSiteVisibility = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'hidden' ? 'hidden' : 'visible';
};

export const isUserPost = (post: UgcLikePost) => String(post?.content_source || 'editorial').toLowerCase() === 'user';

export const isPostVisibleOnSite = (post: UgcLikePost) => {
  if (!isUserPost(post)) return true;

  const state = normalizeSubmissionState(post?.submission_state);
  const visibility = normalizeSiteVisibility(post?.site_visibility);

  if (HIDDEN_STATE_SET.has(state)) return false;
  if (state === 'draft') return false;
  if (state === 'submitted') return visibility === 'visible';
  if (state === 'approved') return visibility === 'visible';
  return false;
};

export const isPostInReview = (post: UgcLikePost) => {
  if (!isUserPost(post)) return false;
  return normalizeSubmissionState(post?.submission_state) === 'submitted' && normalizeSiteVisibility(post?.site_visibility) === 'visible';
};

export const isPostApprovedForIndexGate = (post: UgcLikePost) => {
  if (!isUserPost(post)) return true;
  return normalizeSubmissionState(post?.submission_state) === 'approved' && normalizeSiteVisibility(post?.site_visibility) === 'visible';
};

export const shouldBlogPostBeNoindex = (post: UgcLikePost, indexableByLanguageGate: boolean) => {
  if (!isPostVisibleOnSite(post)) return true;
  if (isPostInReview(post)) return true;
  if (!isPostApprovedForIndexGate(post)) return true;
  return !indexableByLanguageGate;
};

/** Input shape for sitemap indexing (matches Strapi blog-post fields used at build time). */
export type BlogPostSitemapInput = UgcLikePost & {
  translations: LocalizedContent[];
  canonical_language?: SiteLanguage | string;
  published_on?: string | null;
};

/**
 * EN canonical blog path for sitemap when the post is index-eligible (vision / SEARCH_SYSTEM / UGC_SEO_RULES):
 * - non-mock
 * - visibility + moderation gates (shouldBlogPostBeNoindex)
 * - EN translation complete, not runtime, indexable !== false
 * - UGC additionally requires non-empty published_on
 */
export const resolveBlogPostSitemapRelPath = (post: BlogPostSitemapInput): string | null => {
  if (post.mock === true) return null;
  if (isUserPost(post) && !String(post.published_on || '').trim()) return null;

  const canonical = (post.canonical_language || DEFAULT_LANGUAGE) as SiteLanguage;
  const resolution = resolveTranslation(post.translations, DEFAULT_LANGUAGE, canonical, false);
  if (shouldBlogPostBeNoindex(post, resolution.indexable)) return null;

  const output = resolution.output;
  if (!output || String(output.language || '').toLowerCase() !== String(DEFAULT_LANGUAGE).toLowerCase()) {
    return null;
  }
  const slug = String(output.slug || '').trim();
  if (!slug) return null;

  const raw = String(output.canonical_path || '').trim();
  if (raw) {
    if (/^https?:\/\//i.test(raw)) {
      try {
        const pathname = new URL(raw).pathname;
        return pathname || `/en/blog/${slug}/`;
      } catch {
        return `/en/blog/${slug}/`;
      }
    }
    return raw.startsWith('/') ? raw : `/${raw}`;
  }
  return `/en/blog/${slug}/`;
};

export const normalizeCreatorUsername = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');

export const creatorProfilePathForLanguage = (language: SiteLanguage, username: string) => {
  const normalized = normalizeCreatorUsername(username);
  if (!normalized) return null;
  return pathForLanguage(language, `@${normalized}`);
};

export const creatorProfileSectionPathForLanguage = (
  language: SiteLanguage,
  username: string,
  section: '' | 'posts' | 'about' = ''
) => {
  const normalized = normalizeCreatorUsername(username);
  if (!normalized) return null;
  return section ? pathForLanguage(language, `@${normalized}/${section}`) : pathForLanguage(language, `@${normalized}`);
};
