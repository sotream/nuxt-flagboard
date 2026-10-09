---
paths:
  - 'apps/web/**'
---

# Nuxt web app

- Nuxt 4, SPA (`ssr: false`), source under `app/`. State lives in composables, not Pinia.
- The browser only calls its own origin (`/api/v1/*` through a proxy). Do not add CORS or absolute API URLs.
- The access token stays in memory, never in `localStorage`. Refresh goes through the shared helper.
- Every data view has loading, empty and error states. Forms have labels, error text tied to fields, and work
  with the keyboard. No drag and drop as the only way to do something.
- Viewers see controls disabled; the server is what enforces roles.
- Rule and reason types come from `packages/core`; do not redefine them.
