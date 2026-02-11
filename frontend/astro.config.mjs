import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [tailwind({ applyBaseStyles: false })],
  site: process.env.PUBLIC_SITE_URL || 'https://www.geovito.com',
  output: 'static',
  trailingSlash: 'always',
});
