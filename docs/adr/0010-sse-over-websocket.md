# 0010. Live updates over Server-Sent Events, not WebSocket

- Status: accepted
- Date: 2026-10-09

## Context

When one admin changes a flag, other admins looking at the same project should see it without reloading, and a
person with unsaved edits should be warned that the data moved under them. The data flows one way: server to
browser. Browsers send changes with ordinary `PATCH` requests.

## Decision

- Use **Server-Sent Events** at `GET /api/v1/projects/:key/events`. It is plain HTTP, so it passes proxies and
  load balancers, reuses the same authentication and role checks as every other route, and reconnects are just new
  requests. A WebSocket would add an upgrade handshake, a second protocol and a second authentication path for
  traffic that only goes one way.
- The browser `EventSource` cannot send an `Authorization` header, and putting a token in the URL would leak it into
  logs and history. The web app therefore reads the stream with `fetch` and the access token in the header.
- Events are **hints, not data**: `flag.changed` carries the flag key, the environment and the new `revision`.
  The client re-reads the data over the normal API, so there is one source of truth and no event schema to keep
  in sync with the REST shapes. There is no `Last-Event-ID` replay; after a reconnect the client reloads.
- Events are filtered by project **on the server**, so a client never receives another project's changes.
- A user may hold at most 5 streams (`SSE_MAX_STREAMS_PER_USER`); opening a sixth closes the **oldest** rather than
  refusing the new one, so a tab that lost its connection is never locked out by its own dead stream. The evicted
  stream first receives an `evicted` event. The client then does **not** reconnect (it would evict another tab,
  and the tabs would take turns forever) and shows "Live updates paused: too many tabs". Token expiry and shutdown
  send nothing and the client reconnects as usual.
- A stream ends when the access token that opened it expires, so a revoked or expired session cannot keep reading
  changes. The client reconnects with a fresh token. Idle streams send a `heartbeat` every 25 seconds, and the
  response sets `X-Accel-Buffering: no` so reverse proxies do not hold events back.
- On shutdown every open stream is closed, so the server does not wait for clients that never disconnect.
- Changes are published after the database transaction committed, so a stream never announces something that was
  rolled back.

## Consequences

- Simple to run and to test; works behind any HTTP proxy that does not buffer responses.
- The transport is an in-process event bus, so streams only see changes made through the same API instance (see
  the single-instance ADR). Scaling out needs a shared bus such as Postgres `LISTEN/NOTIFY` or Redis.
- Against the HTML Standard: the stream has the right content type and no caching, but no `retry:` and no
  `id:`/`Last-Event-ID` resume, because `EventSource` is not used (it cannot send `Authorization`). The heartbeat is a
  named event. See [ADR 0014](0014-http-standards-conformance.md).
- One-way only. If the UI ever needs low-latency client-to-server messages (collaborative cursors, say), that is the
  point to reconsider WebSocket.
