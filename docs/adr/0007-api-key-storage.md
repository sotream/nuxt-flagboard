# 0007. API key storage

- Status: accepted
- Date: 2026-10-09

## Context

API keys let SDKs read flag configuration. A leaked database or log must not hand out working keys, and a key must
be usable without a slow lookup on every evaluation request.

## Decision

- A key is `fb_srv_` or `fb_cli_` followed by 32 random bytes (256 bits) in base64url. The prefix tells the kind
  at a glance and lets secret scanners recognise a leaked key.
- **Hashed at rest.** Only `SHA-256(key)` is stored, in a unique indexed column, plus a short display prefix (the
  kind and four characters). The full key is returned exactly once, in the response that creates it. It is never
  logged, never written to the audit log (which records the prefix only), and no endpoint returns it again.
- **A fast hash is correct here.** Password hashes (bcrypt, argon2) are slow because passwords are guessable. A key
  with 256 random bits cannot be brute-forced, so SHA-256 loses nothing, and lookup by hash is one indexed read.
- **Malformed input is rejected before any work:** a cheap shape check runs before hashing or the database.
- **Revocation** sets `revoked_at`. A revoked key stays in the list so people can see what existed, and it stops
  working at once (the in-process key cache is cleared on revoke).
- Keys belong to one environment, so a `dev` key can never read `prod`.

## Consequences

- A database leak exposes hashes and prefixes only, not usable keys. A lost key cannot be recovered: create a new
  one and revoke the old one.
- Lookup is exact-match on the hash, so there is no timing side channel from comparing secrets.
- If keys ever became short or human-chosen, this decision would need to be revisited with a slow or keyed hash.
