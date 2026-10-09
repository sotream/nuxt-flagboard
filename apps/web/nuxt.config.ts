import tailwindcss from '@tailwindcss/vite';

// The browser only ever talks to this app's own origin. In development the dev server proxies `/api/` (the admin
// API) and `/v1/` (the public API) to the Flagboard API; in production a reverse proxy does the same, so cookies
// are first-party and no CORS is needed.
const apiUrl = process.env.FLAGBOARD_API_URL ?? 'http://localhost:4010';

export default defineNuxtConfig({
  compatibilityDate: '2026-10-09',
  // An admin tool behind a sign-in has nothing to gain from server rendering; see the SPA vs SSR ADR.
  ssr: false,
  telemetry: false,
  devtools: { enabled: false },
  devServer: { port: 3010 },
  // Imports are always written out (`import { ref } from 'vue'`), so editors, ESLint and readers see where
  // everything comes from. Components are still registered by tag name.
  imports: { autoImport: false },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  typescript: { strict: true },
  app: {
    head: {
      title: 'Flagboard',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'light dark' },
      ],
      // A blocking script in the head, from a file (not inline, so a strict Content-Security-Policy still works):
      // it sets the theme class before the first paint, so there is no flash of the wrong theme.
      script: [{ src: '/theme-init.js' }],
    },
  },
  nitro: {
    devProxy: {
      '/api/': { target: `${apiUrl}/api/`, changeOrigin: false },
      '/v1/': { target: `${apiUrl}/v1/`, changeOrigin: false },
    },
  },
});
