# apps/api

NestJS API (ESM). Two route namespaces: `/api/v1/*` for the admin UI (access token, roles) and `/v1/*` for
applications (API key). Both prefixes live in `src/common/routes.ts`. The rules for this directory are in
`.claude/rules/api-nestjs.md` and `.claude/rules/security.md`; this file is the map.

## Layout

- `src/modules/<feature>/`: auth, users, projects, flags, api-keys, audit, evaluation (the public routes, snapshot
  and key authentication), events (SSE), health.
- `src/infrastructure/`: `config` (validated env), `database` (data source, migrations, seeds), `logging`
  (redaction), `rate-limit`.
- `src/common/`: guards, decorators, filters, enums shared by modules.
- `test/*.e2e-spec.ts`: the real app on PostgreSQL, with both database roles. `test/helpers/` builds the app.

## Commands

```bash
pnpm --filter api test            # unit, no I/O
pnpm --filter api test:e2e        # needs `pnpm infra:up`; uses the <database>_test database
pnpm --filter api db:migrate      # as the migrator role; `db:migrate:generate` for a new migration
pnpm --filter api smoke           # builds, then boots the compiled app once
```

## Things to know

- Evaluation is `packages/core`. Never reimplement rule matching or rollout hashing here.
- Two database roles: the app role (DML only, no UPDATE, DELETE or TRUNCATE on `audit_events`) and the migrator.
  A new table needs its grants in the migration.
- Config is read once through `EnvironmentVariables`; add a new setting there, in `.env.example` and in a test.
- Caches and rate-limit counters are in memory (single instance, ADR 0011). A new cache needs an invalidation path.
- E2E runs share one database and take an advisory lock, so two runs on one machine wait for each other.
- New secret-bearing field in a request or response: add it to the log redaction list and test that it is redacted.
