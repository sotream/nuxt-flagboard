# Security

- Never read, print or commit `.env` files or secrets. `.env.example` holds placeholders only.
- Validate all input at the edge with DTOs. Bound sizes and counts on public endpoints.
- API keys: random, shown once, stored only as a SHA-256 hash. Never log or return them after creation.
- Refresh tokens: random, stored only as a hash, rotated on use, reuse revokes the family.
- Never log tokens, cookies, API keys, passwords or full request bodies; add new secret-bearing keys to the
  logger redaction list.
- Client keys never receive rules or attribute values. Targeting by client-supplied attributes is advisory.
- Use parameterised queries through TypeORM. Never build SQL from strings.
- Rate limiting stays on for public routes. `APP_ENV=prod` fails fast on example secrets and passwords.
- Do not add a dependency for something small; each package is attack surface.
- No real credentials anywhere in the repository, including tests: use obviously fake values and allowlist
  only the named fixture file in `.gitleaks.toml`.
