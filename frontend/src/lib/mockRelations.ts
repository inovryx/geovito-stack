import type { BlogPost } from './strapi';

const MOCK_BLOG_PLACE_REFS: Record<string, string[]> = {
  'post-europe-city-breaks': ['city-de-berlin', 'city-tr-antalya'],
  'post-neighborhood-food-walks': ['district-us-new-york-manhattan', 'district-tr-mugla-bodrum'],
  'post-atlas-neighborhood-layers': ['district-tr-antalya-kas', 'district-de-berlin-mitte', 'poi-us-times-square'],
};

export const resolveBlogPlaceRefs = (post: BlogPost) => {
  if (Array.isArray(post.related_place_refs) && post.related_place_refs.length) {
    return post.related_place_refs.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  if (post.mock === true) {
    return MOCK_BLOG_PLACE_REFS[post.post_id] || [];
  }

  return [];
};
