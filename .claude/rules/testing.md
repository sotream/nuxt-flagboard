---
paths:
  - '**/*.spec.ts'
  - '**/*.test.ts'
  - 'apps/api/test/**'
  - 'apps/e2e/**'
---

# Testing

- Unit tests run without I/O. Replace repositories with small in-memory fakes; construct services directly.
- API e2e tests use the real app and a real PostgreSQL with both database roles. Mock nothing.
- Mock only what you do not own. Never mock the unit under test.
- Test names state a behaviour: `it('revokes the whole family when a rotated token is replayed')`.
- One behaviour per test, arrange-act-assert, no logic in tests (loops are fine for table cases).
- Security paths (auth, roles, key kinds, rate limits, input bounds) need a test for the denied case.
- Property tests use a fixed seed and a stated tolerance so they are never flaky.
- A bug fix starts with a failing test that reproduces it.
