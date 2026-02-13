/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--gv-bg) / <alpha-value>)',
        surface: 'rgb(var(--gv-surface) / <alpha-value>)',
        surface2: 'rgb(var(--gv-surface-2) / <alpha-value>)',
        fg: 'rgb(var(--gv-fg) / <alpha-value>)',
        muted: 'rgb(var(--gv-muted) / <alpha-value>)',
        border: 'rgb(var(--gv-border) / <alpha-value>)',
        accent: 'rgb(var(--gv-accent) / <alpha-value>)',
        accent2: 'rgb(var(--gv-accent-2) / <alpha-value>)',
        success: 'rgb(var(--gv-success) / <alpha-value>)',
        warn: 'rgb(var(--gv-warn) / <alpha-value>)',
        danger: 'rgb(var(--gv-danger) / <alpha-value>)',
      },
      borderRadius: {
        sm: 'var(--gv-radius-sm)',
        md: 'var(--gv-radius-md)',
        lg: 'var(--gv-radius-lg)',
      },
      boxShadow: {
        card: 'var(--gv-shadow-card)',
        float: 'var(--gv-shadow-float)',
      },
    },
  },
  plugins: [],
};
