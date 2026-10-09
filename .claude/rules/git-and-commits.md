# Git and commits

- Conventional Commits: `type(scope): summary`, imperative, under 72 characters. Types: `feat`, `fix`,
  `docs`, `refactor`, `test`, `chore`, `ci`, `perf`. Scopes: `api`, `web`, `core`, `sdk`, `infra`, `docs`.
  The `commit-msg` hook enforces the format.
- One logical change per commit. Do not mix refactoring with behaviour changes.
- Before committing run lint, typecheck and tests (format check for docs-only changes). Never `--no-verify`.
- Specs and plans from the design step go to `docs/superpowers/` and are never committed; the directory is
  git-ignored. Do not force-add it.
- Do not commit `.env*` (except `.env.example`), secrets or local runtime data.
- Do not add co-author trailers or tool-generated lines to commits, pull request text or docs.
- Do not push, merge or change repository settings from an agent session; the owner does that.
