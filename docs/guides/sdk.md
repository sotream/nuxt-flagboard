# SDK guide

`@flagboard/sdk` is a small TypeScript client for the public API (`/v1/*`). It has no dependencies except the shared
evaluation core, uses the global `fetch`, and is fully typed.

## Pick a client

|                | Remote client                                 | Local client                               |
| -------------- | --------------------------------------------- | ------------------------------------------ |
| Key            | server or client key                          | **server key only**                        |
| Evaluates      | on the Flagboard server (`POST /v1/evaluate`) | in your process, from a snapshot           |
| Call           | `await client.evaluate(...)` (async)          | `client.evaluate(...)` (synchronous)       |
| User attribute | sent to the API with each call                | never leave your process                   |
| Good for       | browsers, mobile, simple scripts              | back-end services with many evaluations    |
| Cost           | one request per evaluation                    | one snapshot, then a cheap 304 per refresh |

## API keys

Keys belong to one environment (`dev`, `staging` or `prod`). Create them in the admin UI; the full key is shown
once. A **server key** (`fb_srv_...`) is secret: keep it on servers. A **client key** (`fb_cli_...`) may be shipped in
front-end code, because it can only evaluate flags marked client-visible and never receives rules or salts.

`POST /v1/evaluate` allows cross-origin requests from any origin, so `createRemoteClient` with a client key works in a
browser on a different origin. The snapshot and the admin API do not, so the local client is for servers.

> Targeting by attributes sent from a client is advisory (spoofable): the client chooses what it sends.
> Security-sensitive decisions belong to server keys.

## Remote client

```ts
import { createRemoteClient } from '@flagboard/sdk';

const flags = createRemoteClient({
  baseUrl: 'https://flags.example.com',
  key: process.env.FLAGBOARD_KEY!,
});

const result = await flags.evaluate(
  'new-checkout',
  { userId: 'user-42', attributes: { country: 'UA' } },
  false,
);
if (result.value) {
  // show the new checkout
}
```

`evaluate(flagKey, context, defaultValue)` always resolves. You get `{ value, reason }`; with a server key a rule match
also carries `ruleIndex`. `evaluateAll(context)` returns every flag the key may see.

## Local client

```ts
import { createLocalClient } from '@flagboard/sdk';

const flags = createLocalClient({
  baseUrl: 'https://flags.example.com',
  key: process.env.FLAGBOARD_SERVER_KEY!,
  pollIntervalMs: 30_000, // optional; at least 1000
});
await flags.init(); // throws if the key is wrong, is a client key, or the API is unreachable

flags.evaluate('new-checkout', { userId: 'user-42' }, false); // synchronous
// ...
flags.close(); // on shutdown
```

`init()` is the only call that throws, on purpose: a wrong key should stop your startup instead of turning into silent
defaults. Without `pollIntervalMs` you refresh yourself with `await flags.refresh()`, which resolves `true` when the
flags changed.

## Context and reasons

A context is `{ userId?, attributes? }`. Percentage rollouts need a `userId`. Attribute values are strings (up to 256
characters), finite numbers or booleans; comparison is strict, so `"1"` is not `1`.

Every result has a `reason`:

| Reason               | Meaning                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `KILL_SWITCH`        | the flag is switched off in this environment; the off value is served       |
| `DISABLED`           | the flag is off in this environment                                         |
| `RULE_MATCH`         | a targeting rule matched (first match wins)                                 |
| `ROLLOUT_IN`/`_OUT`  | the percentage rollout put the user in or out                               |
| `ROLLOUT_NO_USER_ID` | a partial rollout needs a `userId` and none was given; the off value wins   |
| `DEFAULT`            | nothing matched; the off value is served                                    |
| `FLAG_NOT_FOUND`     | unknown, archived, or not visible to this key; **your default** is returned |
| `ERROR`              | the SDK could not get an answer; **your default** is returned               |

Evaluation order is fixed: kill switch, enabled, rules in order, rollout, default.

## Failures, timeouts and polling

- **Timeout:** 2 seconds per request by default (`timeoutMs`).
- **Remote client:** never throws. On a failure it returns your default with reason `ERROR` and calls `onError`.
- **Local client:** `refresh()` and polling never throw either. If a refresh fails, the **last good snapshot keeps being
  used** (stale-while-error) and `onError` is called. Polling continues.
- **Polling** sends `If-None-Match` with the last `ETag`, so an unchanged snapshot is a 304 with no body. Each delay is
  the interval plus or minus 10% (jitter), so many instances started together do not poll in lockstep. The next poll is
  scheduled after the previous one finished, and polling timers never keep a Node process alive.
- **`close()`** stops timers and cancels requests in flight. The local client keeps evaluating on its last snapshot.

Failures are `FlagboardError` with a `code`: `BAD_CONFIG`, `INVALID_KEY` (401), `FORBIDDEN` (403, for example a client
key on the local client), `RATE_LIMITED` (429), `SERVER` (5xx), `BAD_REQUEST`, `NETWORK`, `TIMEOUT`, `BAD_RESPONSE`.
Messages are written by the SDK and never contain the API key or content from the response, so they are safe to log.

## Try it

After `pnpm infra:up`, `pnpm db:migrate` and `pnpm db:seed` (which prints a server key and a client key), start the
API (`pnpm --filter api dev`) and run:

```bash
FLAGBOARD_SERVER_KEY=fb_srv_... FLAGBOARD_CLIENT_KEY=fb_cli_... pnpm demo
```

The script shows both clients side by side and checks that they agree.
