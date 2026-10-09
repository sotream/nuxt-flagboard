# 0012. Nuxt SPA behind a same-origin proxy, with a hash-based CSP

- Status: accepted
- Date: 2026-10-09

## Context

The admin UI sits behind a sign-in and shows live, per-user data. Server rendering would add a Node process to run,
and a second place that holds session cookies, for pages that search engines never see. The API already owns
authentication, and the refresh token is an `httpOnly` cookie, so the browser must reach the API on the **same
origin** as the app; otherwise the cookie becomes third-party and every cookie request needs CORS with credentials.

## Decision

- **Nuxt 4 as a single-page app** (`ssr: false`, built with `nuxt generate`). The output is static files.
- **One origin.** In development the Nuxt dev server proxies `/api/` and `/v1/` to the API. In the web image,
  nginx serves the files and proxies the same two prefixes, so cookies stay first-party and no CORS is needed for the
  admin API. (The one exception is `POST /v1/evaluate`, which browsers using a client key call across origins; see
  the key-kinds decision.)
- The `/api/` location sets `proxy_buffering off` and a one-hour `proxy_read_timeout`, because it carries the
  live-update stream (Server-Sent Events): buffering would delay events and the default 60-second read timeout
  would cut a quiet stream. `/v1/` keeps nginx defaults.
- **Content-Security-Policy without `'unsafe-inline'` for scripts.** `nuxt generate` writes two executable inline
  scripts into every HTML file: an import map and the `window.__NUXT__` config. While the web image builds,
  `apps/web/docker/render-nginx-conf.ts` hashes them (SHA-256) and writes the hashes into the nginx config, so
  `script-src` is `'self'` plus those hashes. The build fails if it finds fewer than two, so a change in Nuxt's
  output cannot silently ship a policy that blocks the app. The theme script is a file (`/theme-init.js`) for the
  same reason. Also set: `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self'`,
  `connect-src 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- `style-src` allows `'unsafe-inline'`, because Tailwind and Vue set inline styles. Styles cannot run code, so this
  is a smaller risk than for scripts.

## Consequences

- Nothing to run for the UI except nginx, and the static site can also be served from any file host that can
  proxy two prefixes.
- No server-rendered first paint: a blank page until the script loads, which is acceptable behind a sign-in.
- The hashes change with every build, so the policy is generated, never written by hand. A Nuxt upgrade that adds
  another inline script is caught by the unit test of the extractor and by the browser, which reports CSP violations.
- The Playwright test runs against `nuxt dev` (it has the same proxy), so nginx and the CSP are checked separately:
  by building the image and loading the site in a browser (see the testing guide).
- Not done: HSTS (needs TLS, which belongs to whatever terminates it) and a `Permissions-Policy`.
