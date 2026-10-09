# Testing

| Command                                  | What it runs                                      | Needs                                   |
| ---------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| `pnpm test`                              | Unit and component tests of every package         | nothing running                         |
| `pnpm test:e2e`                          | API tests against real PostgreSQL                 | `pnpm infra:up`                         |
| `pnpm test:browser`                      | One Playwright test of the whole stack            | build, migrated and seeded database     |
| `pnpm --filter api smoke`                | The compiled API starts, answers and shuts down   | `pnpm infra:up` and a migrated database |
| `pnpm lint`, `typecheck`, `format:check` | Static checks                                     | nothing running                         |
| `pnpm bench`                             | Load test of the two public endpoints (not in CI) | a running, seeded API                   |

## What each layer is for

- **`packages/core`**: the evaluation rules and the hash that buckets users. Plain unit tests plus property tests
  (fast-check, fixed seed) for what must hold for any input: the same input always gives the same answer, the
  kill switch always wins, nobody leaves a rollout when the percentage grows, and hostile context input never
  throws.
- **`packages/sdk`**: both clients against a fake server, including timeouts, `304`, stale-while-error and the key
  never appearing in an error message.
- **`apps/api` unit**: services with in-memory fakes. **`apps/api` e2e** (`test/*.e2e-spec.ts`): the real app, real
  PostgreSQL and **both database roles**, so a missing grant or a forbidden `UPDATE` on `audit_events` fails here.
  They use a separate `<database>_test` database, created by the same init script as the main one, so running them
  never touches your development data.
- **`apps/web` unit and component** (`test/unit`, `test/nuxt`): pure helpers in plain Vitest, components and pages
  with Vitest and `@nuxt/test-utils`. The session and the event stream are replaced by fakes there.
- **`apps/e2e`**: one Playwright test, on purpose. It signs in, creates a flag in the browser, switches it on, and
  checks that `POST /v1/evaluate` with a server key gives the new answer. It also runs an accessibility scan
  (`@axe-core/playwright`) on the flag page; the scan found a contrast problem and a duplicate landmark when it was
  added, so it is not decorative.

## Browser test in detail

```bash
pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm build
pnpm --filter e2e exec playwright install chromium     # once
pnpm test:browser
```

Playwright starts the compiled API (`apps/api/dist`) and `nuxt dev`, and reuses them if they already run. It uses
`nuxt dev` and not the built site because the dev server has the proxy for `/api/` and `/v1/`; the built site is
static files, and its proxy is nginx. The test creates its own server key (the seed's keys are shown only once)
and revokes it at the end, and uses a flag key with a timestamp, so it can run again on the same database.

## Checking the images

nginx and the Content-Security-Policy are not covered by the Playwright test. After changing a Dockerfile, the nginx
template or Nuxt, check by hand:

```bash
docker build -f apps/api/Dockerfile -t flagboard-api .
docker build -f apps/web/Dockerfile -t flagboard-web .
docker network create flagboard
docker run -d --name api --network flagboard --env-file .env \
  -e DATABASE_URL=postgres://flagboard_app:<app password>@host.docker.internal:5434/flagboard \
  -e WEB_ORIGIN=http://localhost:3011 -e TRUST_PROXY_HOPS=1 flagboard-api
docker run -d --name web --network flagboard -p 3011:8080 flagboard-web      # API_UPSTREAM defaults to http://api:4010
curl -si localhost:3011/ | head -15                                          # headers, including the CSP
```

Open http://localhost:3011, sign in, and watch the browser console for CSP violations. The page shows "Live" once
the event stream is open. nginx resolves the API's name when it starts, so start the API container first.
Clean up with `docker rm -f api web && docker network rm flagboard`.

## Rules

- A bug fix starts with a failing test that reproduces it.
- Security paths (auth, roles, key kinds, rate limits, input bounds) have a test for the denied case.
- Do not mock the unit under test; mock only what you do not own.
- More in [`.claude/rules/testing.md`](../../.claude/rules/testing.md).

## CI

`.github/workflows/ci.yml` runs: secret scan (gitleaks), lint, format and typecheck, unit tests, API e2e with a
PostgreSQL service plus the smoke test, build with both Docker images, and the browser test. `audit.yml` runs
`pnpm audit --prod` weekly and on demand; it is not a required check. Every action is pinned to a commit SHA.
