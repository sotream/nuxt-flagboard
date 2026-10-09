# Getting started

Run Flagboard on your machine, sign in, and evaluate a flag from the command line.

## You need

- Node 24 (the version in `.nvmrc`; with nvm: `nvm use`)
- pnpm (`corepack enable` picks the version from `package.json`)
- Docker, for PostgreSQL

## Run it

```bash
cp .env.example .env          # placeholders for local use only, nothing to edit
pnpm install
pnpm infra:up                 # PostgreSQL in Docker, waits until it is healthy
pnpm db:migrate               # creates the schema, as the migrator role
pnpm db:seed                  # demo project, flags, an admin and a viewer; prints two API keys once
pnpm dev                      # API and web app together
```

| What       | Where                                                       |
| ---------- | ----------------------------------------------------------- |
| Web app    | http://localhost:3010                                       |
| API        | http://localhost:4010 (health: `/health`)                   |
| API docs   | http://localhost:4010/docs (public API only, dev only)      |
| PostgreSQL | `127.0.0.1:5434` (not 5432, which other projects often use) |

Sign in with `admin@example.com` and the `SEED_ADMIN_PASSWORD` from `.env`. The viewer (`viewer@example.com`,
`SEED_VIEWER_PASSWORD`) can read everything and change nothing. If a port is busy, change `PORT` or
`POSTGRES_PORT` in `.env` (and keep `DATABASE_URL`, `MIGRATOR_DATABASE_URL` and `WEB_ORIGIN` in line).

The seed prints a **server key** and a **client key** once. They cannot be shown again; create new ones on the
project's API keys page. The seed does nothing if the demo project exists already.

### Start again from nothing

The database roles are created by an init script that runs only when the data volume is empty. If you changed a
password in `.env` after the first start, or want a clean slate:

```bash
pnpm infra:reset              # removes the volume and starts PostgreSQL again
pnpm db:migrate && pnpm db:seed
```

## Try the API with curl

The flow the UI uses, without the UI. It reads the credentials from `.env` into your shell (nothing is printed).

```bash
set -a; source .env; set +a
API=http://localhost:4010

# 1. Sign in. The access token is short-lived; the refresh token travels in an httpOnly cookie.
#    Cookie endpoints check the Origin header, so send the web app's origin.
TOKEN=$(curl -s $API/api/v1/auth/login -H "Origin: $WEB_ORIGIN" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SEED_ADMIN_EMAIL\",\"password\":\"$SEED_ADMIN_PASSWORD\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')

# 2. Create a boolean flag in the demo project
curl -s $API/api/v1/projects/demo/flags -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"key":"hello","name":"Hello","type":"boolean"}'

# 3. Create a server key for the dev environment (the full key is in the response, once)
KEY=$(curl -s $API/api/v1/projects/demo/keys -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"environment":"dev","kind":"server","name":"curl"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).key')

# 4. Ask the public API. A new flag is off.
curl -s $API/v1/evaluate -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"flags":["hello"],"context":{"userId":"user-1"}}'
# {"flags":{"hello":{"value":false,"reason":"DISABLED"}}}

# 5. Switch it on for everyone in dev. `revision` is the revision you last read; a stale one gets 409.
REV=$(curl -s $API/api/v1/projects/demo/flags/hello -H "Authorization: Bearer $TOKEN" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).environments.find(e=>e.environment==="dev").revision')
curl -s -X PATCH $API/api/v1/projects/demo/flags/hello/environments/dev -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"revision\":$REV,\"enabled\":true,\"rolloutPercentage\":100}"

# 6. Ask again
curl -s $API/v1/evaluate -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"flags":["hello"],"context":{"userId":"user-1"}}'
# {"flags":{"hello":{"value":true,"reason":"ROLLOUT_IN"}}}
```

Why step 5 needs a rollout: a flag that is on with a 0 % rollout serves its off value to everyone. The order is
kill switch, enabled, targeting rules, rollout, default; see the evaluation ADRs.

## Next

- Use the SDK from code: [SDK guide](sdk.md). `pnpm demo` runs a small tour of both clients (needs the two keys).
- Run the tests: [testing guide](testing.md).
- Why things are built this way: [`docs/adr/`](../adr).
- Run the Docker images: see the end of the testing guide.
