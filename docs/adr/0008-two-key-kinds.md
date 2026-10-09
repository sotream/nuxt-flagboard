# 0008. Two API key kinds: server and client

- Status: accepted
- Date: 2026-10-09

## Context

Some SDKs run on servers, where a key stays secret. Others run in browsers or mobile apps, where anyone can read
the key from the page. The same key must not give both the power to read all targeting rules and the ability to
be copied out of a web page.

## Decision

- A **server key** can call `GET /v1/snapshot` (the full configuration with rules, salts and rollout) and
  `POST /v1/evaluate`. It is meant to be kept secret.
- A **client key** can only call `POST /v1/evaluate`. It gets values and reasons, never rules, salts or attribute
  values, and `GET /v1/snapshot` answers **403**. For a client key the reason `RULE_MATCH` carries no rule index.
- A flag is visible to client keys only when `client_visible` is true (default false). For a client key a flag
  that is not visible behaves exactly like an unknown flag: `FLAG_NOT_FOUND`, with no way to tell the two apart.
- Both kinds belong to one environment.
- **Targeting by client-supplied attributes is advisory (spoofable).** A client chooses the attributes it sends, so
  any rule that depends on them can be bypassed by a user who edits their own requests. Security-sensitive
  decisions belong to server keys, where the application supplies trusted attributes.

## Consequences

- Putting a key in front-end code cannot leak targeting rules or the existence of server-only flags.
- Percentage rollout by `userId` is fine on a client key; use it for gradual UI rollouts, not for access control.
- Evaluating on a client key needs a network call per context (it cannot use local evaluation, which needs the
  snapshot), which is the price of keeping rules private.
