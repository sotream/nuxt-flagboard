# 0009. Snapshot and its ETag

- Status: accepted
- Date: 2026-10-09

## Context

SDKs that evaluate locally need the configuration of their environment, and they poll for changes. Most polls find
nothing new, so those must be cheap for the SDK and for the API.

## Decision

- `GET /v1/snapshot` (server keys only) returns every non-archived flag of the key's environment with what core
  needs to evaluate it: key, type, values, salt, enabled, rollout percentage, rules and kill switch. Archived
  flags are left out. Nothing time-dependent (timestamps, revisions, kill reasons) is included.
- The body is a **deterministic serialisation**: flags ordered by key, object keys sorted at every level, rule
  order kept (it is meaningful). The `ETag` is the SHA-256 of that body, as a strong validator. It therefore changes
  exactly when the configuration changes, and not otherwise.
- The SDK sends `If-None-Match`; an unchanged snapshot answers **304** with no body. `Cache-Control: private,
no-cache` and `Vary: Authorization` stop shared caches from storing a response that depends on the key.
- Any change to the environment (a flag, a rule, a rollout, a kill switch, an archive, a new flag) changes the
  body, so it **invalidates every SDK cache of that environment**. This is deliberate: one rule for all changes is
  easy to reason about and cannot serve a stale mix. A change in another environment does not touch this ETag.
- The snapshot is built once per environment and cached in memory, and dropped when a flag in the project changes
  (after the change committed). The `revision` used for optimistic locking is not part of the ETag.

## Consequences

- Polling an unchanged environment costs a cache hit and a 304.
- A small change makes every SDK of that environment download the whole snapshot once. That is acceptable while a
  snapshot is small (tens of flags). If snapshots grow large, per-flag diffs or streaming would be the next step.
- The ETag is only as stable as the serialisation, so the canonical form is covered by tests, including that the
  same data in a different key order yields the same ETag.
