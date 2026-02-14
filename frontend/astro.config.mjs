import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';

const normalizeSiteOrigin = (value) => {
  try {
    const parsed = new URL(value);
    const isProdLike = process.env.CF_PAGES === '1' || process.env.NODE_ENV === 'production';
    if (isProdLike && parsed.hostname.startsWith('www.')) {
      parsed.hostname = parsed.hostname.slice(4);
    }
    return parsed.origin;
  } catch {
    return value.replace(/\/$/, '');
  }
};

export default defineConfig({
  integrations: [tailwind({ applyBaseStyles: false })],
  adapter: cloudflare(),
  site: normalizeSiteOrigin(process.env.PUBLIC_SITE_URL || 'https://www.geovito.com'),
  output: 'static',
  trailingSlash: 'always',
});
