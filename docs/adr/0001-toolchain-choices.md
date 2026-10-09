# 0001. Toolchain choices

- Status: accepted
- Date: 2026-10-09

## Context

The project needs a current, supported toolchain that one person can explain end to end. Versions were
checked against the npm registry (`npm view`) on the date above.

## Decision

- **Node 24** (`.nvmrc`), **pnpm 12** workspaces and **Turborepo** for task running and caching.
- **Nuxt 4** (latest 4.6.0) as an SPA. Nuxt 3 reached end of life on 2026-07-31 (per the Nuxt roadmap, checked on 2026-10-09) and no longer receives bug or
  security fixes, so starting on it would mean starting on an unsupported base. Nuxt 4 changes that matter
  here: the `app/` source directory, shared state between `useAsyncData`/`useFetch` calls with the same key,
  and `noUncheckedIndexedAccess` on by default. Nuxt's engines field requires Node 22.22.3+ or 24.15+, which
  Node 24 satisfies.
- **TypeScript 6.0.x**, not 7.x. TypeScript 7 is `latest`, but `typescript-eslint` 8.71 declares
  `typescript >=4.8.4 <6.1.0` and `@nestjs/swagger` declares `^5.5.0 || ^6.0.0`, so 7 is not accepted by two
  tools we depend on. Revisit when both support it and lint and typecheck pass.
- **Tailwind CSS 4** through `@tailwindcss/vite`. `@nuxtjs/tailwindcss` still bundles Tailwind 3.4, and Nuxt 4.6
  builds with Vite 8, which the Tailwind Vite plugin accepts.
- **Vitest 5** for unit and API e2e tests, `@nuxt/test-utils` for Nuxt components, Playwright for the browser
  test, **ESLint 10** flat config with `typescript-eslint`, Prettier, Husky, lint-staged and commitlint.

## Consequences

- Everything is on a supported major, and the choices are recorded with the reason, so they can be revisited.
- Pinning TypeScript to 6.0 costs us TypeScript 7 features and speed until the tooling catches up.
- Wiring Tailwind 4 by hand is a few lines more than using the Nuxt module, in exchange for the current major.
