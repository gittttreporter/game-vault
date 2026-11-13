// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Pages configuration
//
//  • If your repo is named  `<username>.github.io`  → keep base: '/' and set
//    site: 'https://<username>.github.io'
//
//  • If your repo is named anything else (project site) → set
//      site: 'https://<username>.github.io'
//      base: '/<repo-name>'
//    (no trailing slash on base)
// ─────────────────────────────────────────────────────────────────────────────
export default defineConfig({
  site: 'https://YOURUSERNAME.github.io',
  base: '/',
  trailingSlash: 'always',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});
