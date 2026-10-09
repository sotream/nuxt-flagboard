# nuxt-flagboard

Feature-flag service: a NestJS API (`apps/api`), a Nuxt admin UI (`apps/web`), a pure evaluation core
(`packages/core`) and a typed SDK (`packages/sdk`) in a pnpm and Turborepo monorepo. It is a portfolio project:
favour clear, conventional code over clever code, and keep every decision explainable.

## Stack

Node 24 (`.nvmrc`), pnpm, Turborepo, TypeScript strict. API: NestJS (ESM), TypeORM with migrations, PostgreSQL,
Vitest, Supertest. Web: Nuxt 4 as an SPA (`ssr: false`), Tailwind, composables (no Pinia). Infra in
`docker-compose.yml` only (PostgreSQL).

## Commands

```bash
pnpm install
pnpm lint | typecheck | test | test:e2e | build     # test:e2e needs the database running
pnpm test:browser                                   # Playwright; needs build, migrated and seeded database
pnpm format:check
```

## Hard rules

- No `any`. Use interfaces, generics, or `unknown` with narrowing.
- Before finishing any task run `pnpm lint`, `pnpm typecheck` and `pnpm test` (plus `pnpm test:e2e` when the API
  changed and `pnpm build` when build-affecting code changed). Do not claim something works without running it.
- Never read, print or commit `.env` files or secrets. `.env.example` holds placeholders only.
- Schema changes only through migrations. The application database role has no DDL rights and no UPDATE,
  DELETE or TRUNCATE on `audit_events`.
- Conventional Commits, imperative, under 72 characters, one logical change each. No refactoring mixed with
  behaviour changes. Never skip hooks with `--no-verify`.
- Specs and plans from the design step live in `docs/superpowers/` and are never committed (git-ignored).
- Do not copy code from private repositories. Build from scratch.
- Comments explain why, not what. Delete unused code. No abstraction without a second use.
- Do not add a dependency for something small; check install scripts and the registry version first.

## Where the rules are

`.claude/rules/`: typescript, api-nestjs, web-nuxt, testing, security, git-and-commits. Decisions are recorded
in `docs/adr/` (copy `docs/adr/template.md`, keep each ADR to one page).
