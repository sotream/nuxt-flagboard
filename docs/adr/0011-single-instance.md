# 0011. Single API instance: state kept in memory

- Status: accepted
- Date: 2026-10-09

## Context

Flagboard runs as one API process against one PostgreSQL. Several things are cheapest and fastest when kept in
that process's memory, and adding Redis would double the infrastructure for a project of this size.

## Decision

These live in memory, in one process:

- the **snapshot cache** per environment, and the **API key cache** (valid keys until revoked, unknown keys for
  5 seconds), both dropped when the data changes;
- the **rate limit counters**: sign-in attempts per IP, requests per API key, and failed key authentications per IP;
- the **change bus** that feeds the snapshot cache and the SSE streams, and the registry of open streams;
- the **refresh token cleanup timer**.

Everything durable stays in PostgreSQL. Writes still go through transactions with optimistic locking, so a restart
loses no data. Behind a reverse proxy, `TRUST_PROXY_HOPS` must be set, otherwise every client appears to come from
the proxy's address and shares one rate-limit bucket.

## Consequences

- A restart resets the rate limits and empties the caches (they refill from the database on demand), and open
  streams reconnect.
- **A second instance would be wrong in specific ways:** a flag change made on one instance would not clear the
  snapshot cache or reach the SSE streams of the other, so SDKs and admins could see stale configuration until the
  next change; rate limits would be per instance; a revoked key could keep working on the other instance.
- The way out is a shared bus and shared counters: Postgres `LISTEN/NOTIFY` for change events and cache
  invalidation (no new infrastructure), and Redis only if rate limits must be exact across instances. The code
  already goes through the `FlagChangeBus` and the key revocation stream, so those are the seams to replace.
- Documented in the README under Known limitations.
