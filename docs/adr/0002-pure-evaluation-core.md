# 0002. Pure evaluation core shared by API and SDK

- Status: accepted
- Date: 2026-10-09

## Context

A flag evaluation must give the same answer wherever it runs. The API evaluates for `POST /v1/evaluate`, and the
SDK evaluates locally from a snapshot. If each had its own implementation, they would drift, and a user could be
rolled in on the server and out in the client.

## Decision

- `packages/core` holds one function, `evaluate(flag, context, defaultValue)`, plus the types it needs. It has no
  dependencies, no I/O, no clock and no randomness, and it is synchronous.
- It runs unchanged in Node and in browsers. That rules out `node:crypto` and anything asynchronous, which is why
  hashing is [a small pure function](0003-rollout-hashing.md).
- Evaluation order is fixed and tested step by step: kill switch, enabled, rules in order (first match wins),
  rollout, default. An unknown flag returns the caller's default with reason `FLAG_NOT_FOUND`.
- Matching is strict: `equals` is `===` and `in` is a strict `includes`, so `"1"` is not `1`. A missing
  attribute never matches.
- The API and the SDK import core. They never re-implement any of it. Golden tests pin the hash and the bucket
  values so a change to either fails loudly.

## Consequences

- Behaviour is tested once, in one place, and both consumers inherit it. The API and SDK tests only need to prove
  they call core with the right data.
- Core must stay free of environment APIs. A feature that needs one (for example time-based rules) belongs
  outside core or needs a new decision.
- Changing evaluation semantics changes results for every SDK that updates, so such a change needs a new ADR and
  a version bump.
