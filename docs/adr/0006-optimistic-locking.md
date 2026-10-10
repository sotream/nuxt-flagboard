# 0006. Optimistic locking with a revision

- Status: accepted
- Date: 2026-10-09

## Context

Two admins can open the same flag, change different things and save. Without a check, the second save silently
overwrites the first, and with feature flags that can turn a feature on in production by accident. Holding
database locks while a person thinks is not an option.

## Decision

- Every flag environment (a flag in one environment) has an integer `revision`, starting at 1.
- Every update and every kill-switch action must send the `revision` it last read, in the JSON body (not an
  `If-Match` header, so it validates like any other field and the `ETag` stays reserved for the snapshot).
- The write is one statement: `UPDATE ... SET revision = revision + 1 WHERE id = ? AND revision = ?`. If no row
  matches, someone else changed it first and the API answers **409** with `code: REVISION_MISMATCH` and the current
  state in the body. The audit row is written in the same transaction, so a rejected update leaves no trace.
- Only real changes bump the revision. An update that sets what is already there returns the current state and
  does nothing, so a harmless retry never conflicts.
- After a successful change a change event with the new revision is published (used for live updates), so a client
  can tell its own change from someone else's.
- The revision is **not** part of the snapshot ETag. It exists for conflict detection only.

## Consequences

- Concurrent edits cannot overwrite each other, and the conflicting client gets what it needs to resolve it
  (the current state), which is what the admin UI uses to let a person load the latest or reapply their edits.
- A person can lose a few seconds of work on a conflict. That is the intended trade-off against silent loss.
- Flag metadata (name, description, client visibility, archive) is not versioned: those changes are low risk and
  last write wins, with every change audited.
- The check is per flag environment, so two admins editing different environments of one flag never conflict.
- The `revision` is in the body on purpose, not in `ETag` and `If-Match`. [ADR 0014](0014-http-standards-conformance.md)
  records why, and what the standard pattern would look like if it is ever wanted. The 409 is a problem details
  response (RFC 9457) with the current state in the extension member `current`.
