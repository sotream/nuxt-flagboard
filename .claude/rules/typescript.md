---
paths:
  - '**/*.ts'
  - '**/*.vue'
---

# TypeScript

- Strict mode is on. `any` is a lint error: use interfaces, generics, or `unknown` plus narrowing. A cast
  through `unknown` at a boundary you cannot type is acceptable; say why in a comment.
- Add an abstraction when the second use appears, not before.
- `sonarjs/cognitive-complexity` fails above 10: split into named helpers instead of nesting.
- Delete unused code, imports and exports. No commented-out code.
- Comments explain why, never what. Exported APIs get a short JSDoc.
- Name by intent (`findForEnvironment`, not `getData`). Booleans read as questions (`isArchived`).
- Use `import type` for type-only imports. In ESM packages relative imports end in `.js`.
