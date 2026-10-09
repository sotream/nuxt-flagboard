# 0004. Auth: short access token and rotating refresh cookie

- Status: accepted
- Date: 2026-10-09

## Context

The admin UI needs sessions that last days without keeping a long-lived credential where scripts can read it,
and a stolen token should do limited damage. Roles are `admin` (writes) and `viewer` (reads).

## Decision

- **Access token:** a JWT (HS256, 15 minutes) returned in the response body and kept in memory by the web app,
  sent as a Bearer token. It is verified from its signature alone, with no database lookup per request.
- **Refresh token:** 384 random bits in an `httpOnly`, `SameSite=Lax` cookie, `Secure` in production, with
  `Path=/api/v1/auth` so it is only sent to the auth endpoints. Only its SHA-256 is stored; a fast hash is
  correct because the token cannot be guessed.
- **Rotation and reuse detection:** every refresh revokes the presented token and issues a new one in the same
  family (one family per sign-in). Presenting an already revoked token revokes the whole family. The revoke is a
  single `UPDATE ... WHERE revoked_at IS NULL`, so of two concurrent requests only one succeeds and a race cannot
  mint two valid tokens; the loser counts as reuse.
- **Passwords:** `bcryptjs`, cost 10. Passwords are limited to 72 bytes because bcrypt ignores the rest, and new
  passwords need at least 12 characters. An unknown email is compared against a dummy hash so timing does not
  reveal which emails exist. There is no self-registration; an admin creates viewers.
- **Cookie endpoints check `Origin`:** a missing or different `Origin` is rejected. This is the CSRF defence on
  top of `SameSite=Lax`.
- **Same site:** the browser only talks to the web origin, which proxies `/api/` to the API, so cookies are
  first-party and there is no CORS. The web app and the API must share a site; a cross-site deployment would
  need `SameSite=None; Secure` and a new review.
- **Roles by default:** without `@Roles()` a route lets any signed-in user read (`GET`, `HEAD`) and requires
  `admin` for every other method.
- **Secrets:** `JWT_ACCESS_SECRET` has no default. The seed admin password comes from `SEED_ADMIN_PASSWORD`. With
  `APP_ENV=prod` the service refuses to start on example values from `.env.example`.

## Consequences

- Logout and theft response are immediate for refresh tokens. An access token stays valid until it expires, so
  after logout, a role change or a deleted user the old access token keeps working for up to 15 minutes, and a
  role inside it can be that stale. Shorten `ACCESS_TOKEN_TTL_SECONDS` to narrow the window, or add a deny list or
  a per-request user check if immediate revocation becomes a requirement.
- Two browser tabs refreshing with the same cookie at the same instant look like reuse and sign the user out, so
  the web app shares one in-flight refresh per tab and serialises refreshes across tabs with a Web Lock.
- Revoked rows are kept (default 14 days) so reuse can be detected, and a timer in the API deletes old rows.
- Rate limits are per client IP and in memory (see the single-instance ADR); sign-in allows 10 attempts per minute.
