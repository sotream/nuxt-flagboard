# 0014. HTTP standards conformance: what follows which RFC, and what does not

- Status: accepted
- Date: 2026-10-10

## Context

The API, the SDK, the live-update stream and the web image use HTTP features that have standards. A review compared
them with the standards text (RFC 9110, 9111, 9457, 8725, 6750, the HTML Standard for server-sent events, and the
Fetch Standard through MDN for CORS) and the live responses of the compiled API. Where the standard is sensible for a
small project the code follows it; where it is not, the deviation is recorded here, so it reads as a choice.

## Decision: follows the standard

| Area               | What the code does                                                                                                                                                                                                                                                                                                  | Standard                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Error bodies       | Every error is `application/problem+json` with `type`, `title`, `status`, `detail`, `instance`. `status` equals the HTTP status. Our members are extensions: `code`, `errors`, `current`. Catalogue: `docs/guides/errors.md`.                                                                                       | RFC 9457 §3, §3.2                            |
| Validation errors  | One entry per violated constraint, `errors: [{ pointer: "#/rules/0/serve", detail }]`, so all fields are listed.                                                                                                                                                                                                    | RFC 9457 §3 (the `errors` example), RFC 6901 |
| Server errors      | A 500, or any 5xx, has no `detail`: nothing about the cause leaves the server.                                                                                                                                                                                                                                      | RFC 9457 §4 (security considerations)        |
| 405                | A known path with the wrong method answers 405 and `Allow`.                                                                                                                                                                                                                                                         | RFC 9110 §15.5.6                             |
| 415                | A body that is not `application/json` answers 415.                                                                                                                                                                                                                                                                  | RFC 9110 §15.5.16                            |
| 201                | Creating a project or a flag sends `Location` of the new resource, only after it was created.                                                                                                                                                                                                                       | RFC 9110 §10.2.2                             |
| 401                | Every 401 carries `WWW-Authenticate: Bearer`, with `error="invalid_token"` only when a token or key was sent.                                                                                                                                                                                                       | RFC 9110 §15.5.2, RFC 6750 §3                |
| 429, 503           | `Retry-After` in delay-seconds (the HTTP-date form is also valid; we send seconds). The SDK reads both forms and waits.                                                                                                                                                                                             | RFC 9110 §10.2.3                             |
| Conditional GET    | `GET /v1/snapshot` has a strong quoted ETag. `If-None-Match` is parsed as a list of entity-tags (a comma inside quotes is part of the tag, empty list elements are ignored, a malformed field never matches), compared weakly, and `*` is accepted. The 304 repeats `ETag`, `Cache-Control` and `Vary`. HEAD works. | RFC 9110 §8.8.3, §13.1.2, §15.4.5            |
| Caching            | The admin API answers `Cache-Control: no-store` (token responses also `Pragma: no-cache`). The snapshot is `private, no-cache` with `Vary: Authorization`.                                                                                                                                                          | RFC 9111 §5.2.2.5                            |
| JWT                | HS256 only, pinned when signing and verifying, so `alg: none` and other algorithms are rejected. `iss` and `aud` are set and verified. Secret of at least 32 characters.                                                                                                                                            | RFC 8725 §3.1, §3.2, §3.8, §3.9              |
| Cookie             | Refresh token: `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/api/v1/auth`, `Max-Age` 7 days.                                                                                                                                                                                                           | RFC 6265bis §4.1.2                           |
| CORS               | Only `POST /v1/evaluate`: preflight 204, `Authorization` named explicitly (a `*` does not cover it), `Access-Control-Allow-Origin: *` without credentials, `Access-Control-Max-Age: 7200` (Chromium caps the cache at two hours).                                                                                   | Fetch Standard, MDN                          |
| Server-sent events | `text/event-stream`, `Cache-Control: no-cache, no-store`, `X-Accel-Buffering: no`, nginx with `proxy_buffering off` and a long read timeout.                                                                                                                                                                        | HTML Standard §9.2                           |
| Web image          | CSP, `X-Content-Type-Options`, `Referrer-Policy`, and a `Permissions-Policy` that switches off camera, microphone, geolocation, payment and USB.                                                                                                                                                                    | W3C Permissions Policy                       |

## Decision: deliberate deviations

- **The `revision` stays in the request body** instead of `ETag` and `If-Match` ([ADR 0006](0006-optimistic-locking.md)).
  The standard pattern is a strong ETag per flag environment, `If-Match` on the write, 412 on a mismatch and 428 when
  the header is missing. It would work, but a revision in the body validates like any field, keeps the `ETag` header
  for the snapshot, and the admin UI's conflict flow reads the current state from the 409 body. A stale revision is a
  state conflict, which 409 describes. If the API gets other clients, `ETag`/`If-Match` can be added next to the
  field; nothing here prevents it.
- **No `__Host-` prefix on the refresh cookie.** It requires `Path=/`, which would send the refresh token with every
  API request instead of only to the auth routes. `__Secure-` would work in production only and make the cookie name
  depend on the environment, for a small gain.
- **No `Accept` negotiation (406).** Servers may ignore `Accept`; the API only speaks JSON.
- **Login and refresh answer 401 without a challenge.** The credentials are in the body or in a cookie, not in an HTTP
  authentication scheme, and a `Basic` challenge would make browsers open a password dialog.
- **No standard rate-limit headers.** `X-RateLimit-*` is not a standard and the IETF `RateLimit` fields are still a
  draft. The throttler's own `X-RateLimit-*-login` headers on the sign-in route are left as they are. `Retry-After`
  is the contract.
- **`Location` only for projects and flags.** Keys and users have no `GET` by id, so there is nothing to point to.
- **JWT `nbf` and `typ` are not used.** There are no tokens valid only from a later time, and one kind of token.
  RFC 8725 §3.11 recommends `typ` for new uses; with a single token type it adds nothing yet.
- **SSE has no `retry:` field and no `id:`/`Last-Event-ID` resume** ([ADR 0010](0010-sse-over-websocket.md)). Those
  matter for `EventSource`, which cannot send an `Authorization` header, so the web app reads the stream with `fetch`
  and has its own back-off; events are hints and a reconnect reloads the data. The heartbeat is a named `heartbeat`
  event, not a comment line: valid, and it also resets the client's idle timer. The HTTP/1.1 per-origin connection
  limit is why one user may hold at most five streams.
- **No HSTS.** It belongs to whatever terminates TLS (ADR 0012).

## Consequences

- Errors have one shape. Clients that know problem details can read any error; the others read `status`, `title`
  and `detail`. The old members `statusCode`, `error` and `message` are gone. The web app and the SDK were the only
  clients: the web app reads `detail` and `errors`, and the SDK never copied bodies into its errors.
- Access tokens issued before this change have no `iss` and `aud` and are rejected once. The web app refreshes
  silently (the lifetime is 15 minutes).
- The SDK gained an optional `FlagboardError.retryAfterMs` and its local client waits for it between polls. This is
  additive: no existing code breaks (the SDK is 0.x, and this would be a minor change anyway).
- A route miss costs a short scan of Express's route table to build `Allow`; it is only done for 404s.
