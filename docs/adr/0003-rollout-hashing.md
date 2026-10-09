# 0003. Rollout hashing and bucket resolution

- Status: accepted
- Date: 2026-10-09

## Context

A percentage rollout must be stable: a user who is in stays in, raising the percentage only adds users, and
different flags must not roll out to the same users. It must also be computed identically in the API and in every
SDK, in Node and in browsers, without a server round trip.

## Decision

- Bucket = `murmur3_32(salt + ":" + userId) % 10000`, hashing the UTF-8 bytes with seed 0. A user is rolled in
  when `bucket < percentage * 100`. At 100% everyone is in and at 0% nobody is, without hashing.
- MurmurHash3 is non-cryptographic, fast, well distributed and about 40 lines of pure TypeScript. This is
  bucketing, not security, so a cryptographic hash is not needed.
- `salt` is 16 random bytes in hex, created with the flag and never changed. Using it, instead of the flag key,
  makes cohorts differ between flags and keeps them unguessable from the key alone.
- 10 000 buckets (0.01% steps). Percentages are integers 0 to 100 today. If finer steps are wanted later, only the
  threshold changes and no user moves. Percentages below 1 are already supported by the threshold
  (`percentage * 10000 / 100`), even though the API validates integers for now.
- A partial percentage (1 to 99) needs a `userId`. Without one the off value is returned with reason
  `ROLLOUT_NO_USER_ID`, because there is no stable identity to bucket.
- Correctness is pinned by published MurmurHash3 test vectors and by fixed `(salt, userId) -> bucket` pairs checked
  against an independent implementation. Distribution is checked on 100 000 fixed ids within one percentage point.

## Consequences

- The `salt:userId` key format and the hash are a permanent contract. Changing either moves users between
  buckets, so a change needs a new ADR and a migration plan.
- The salt is part of the snapshot, so server keys see it and client keys never do. A leaked salt reveals which
  bucket a known user id is in, which is acceptable for rollout (not an access control).
- Distribution is statistically even but not perfectly so for small groups; do not use it for exact splits.
