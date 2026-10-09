---
paths:
  - 'apps/api/**'
---

# NestJS API

- A feature lives in `src/modules/<feature>/` with controller, service, `dto/`, `entities/`. Technical code goes
  in `src/infrastructure/`, shared helpers in `src/common/`.
- Controllers translate HTTP only; rules live in services. Use TypeORM repositories directly.
- Every input is a DTO with `class-validator` decorators. The global pipe whitelists and rejects unknown
  fields, so never accept an id or a role from a body.
- Every admin route is protected unless marked `@Public()`. Use `@Roles()` for role limits. Public `/v1/*`
  routes authenticate with an API key and declare which key kinds they accept.
- Throw Nest HTTP exceptions with a message a client can act on. Map unique-constraint errors to 409.
- Migrations: schema changes only through migration files, run as the migrator database role. The application
  runs as a role with DML only. Never edit a migration that was already committed; add a new one.
- Flag-environment updates carry `revision`; a mismatch returns 409 with the current state.
