# 0005. Audit log design

- Status: accepted
- Date: 2026-10-09

## Context

Feature flags change production behaviour, so teams need to know who changed what and when, and to be able to trust
that the record was not edited afterwards. A bug or a compromised application must not be able to rewrite history.

## Decision

- **One row per change** in `audit_events`: project, actor (id and email), action, optional flag and environment,
  and `before` and `after` as JSON. Secrets never go in: an API key event records only its prefix.
- **Same transaction as the change.** `AuditService.record` needs the caller's transaction manager, so the change
  and its audit row commit or roll back together. There is no way to record an event outside a transaction.
- **Append-only at the database level, with two roles.** `flagboard_migrator` owns the schema and runs migrations.
  The API connects as `flagboard_app`, which has `INSERT` and `SELECT` on `audit_events` and nothing else: `UPDATE`,
  `DELETE` and `TRUNCATE` are revoked. An end-to-end test runs all three as the application role and expects
  `permission denied`. Roles were chosen over a trigger because a trigger can be dropped or disabled by whoever
  owns the table, and the application does not own it.
- **No foreign key that could rewrite history.** A cascading or `SET NULL` action runs with the table owner's
  rights, so `actor_id` has no foreign key (the email keeps the row readable if a user is removed) and
  `project_id` is `ON DELETE RESTRICT`.
- **Keyset pagination** on `(created_at, id)`, newest first, with the cursor being the id of the last row. Pages
  stay stable while new events arrive, and rows with an identical timestamp are not skipped or repeated.
- **Read-only API.** Every signed-in user, viewers included, can read the log; no route changes or deletes events.

## Consequences

- The application cannot tamper with history, even if it is compromised. The database owner or a superuser still
  can, so this is tamper-resistant against the application, not tamper-proof against the database administrator.
- Rows cannot be pruned by the application, so the table only grows. Retention needs an operator-run job as the
  owner (or partitioning) and is out of scope here.
- Writing audit rows adds one insert to each change; that is cheap at this scale.
