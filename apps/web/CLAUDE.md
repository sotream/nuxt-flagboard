# apps/web

Nuxt 4 admin UI, a static single-page app (`ssr: false`) served by nginx in the image. The rules for this
directory are in `.claude/rules/web-nuxt.md`; this file is the map.

## Layout

- `app/pages/`, `app/layouts/`, `app/middleware/auth.global.ts` (redirects to `/login` without a session).
- `app/components/`: presentational pieces; every data view has loading, empty and error states.
- `app/composables/`: state (`useSession`, `useResource`, `useProjectEvents`). No Pinia.
- `app/utils/`: pure logic (editors, formatters, the SSE loop, the Web Lock helper). Tested without Nuxt.
- `test/unit` (plain Vitest) and `test/nuxt` (Nuxt environment). `docker/` renders the nginx config with CSP hashes.

## Commands

```bash
pnpm --filter web dev             # http://localhost:3010, proxies /api and /v1 to the API
pnpm --filter web test
pnpm --filter web typecheck       # nuxt typecheck
pnpm test:browser                 # Playwright flow with an axe scan, from the repository root
```

## Things to know

- Auto-imports are off: import `ref`, `useState` and the rest explicitly.
- The browser calls only its own origin. In development Nuxt proxies; in the image nginx does.
- The access token lives in memory. Refreshing goes through the shared helper, which serialises it across tabs.
- Rule, reason and flag types come from `@flagboard/core`; request and response types are in `app/utils/api-types.ts`.
- Viewers see disabled controls, and the API is what enforces roles. Never hide a check only in the UI.
- Any new inline script breaks the CSP (script hashes are generated at image build). Keep scripts in files.
- Dev server and image behave differently for headers: check security headers on the built image, not on `nuxt dev`.
- Do not delete `.nuxt` or `.output` from a script; tell the owner the command instead.
