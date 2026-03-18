---
name: linting
description: ESLint and Prettier configuration, rule selection rationale, and auto-fix conventions.
---

# Linting

Use this skill when configuring lint rules, fixing lint issues, or reviewing lint configuration changes.

## Tools

- **ESLint**: code quality and correctness rules.
- **Prettier**: formatting (indentation, quotes, semicolons, line width).
- **typescript-eslint**: TypeScript-specific rules.

## Configuration Principles

- Prettier handles all formatting. ESLint handles logic and correctness.
- No overlap: use `eslint-config-prettier` to disable ESLint rules that conflict with Prettier.
- Prefer rules that are auto-fixable.
- Every enabled rule must have a reason. No "enable everything" configs.

## Key Rules

- `no-console`: warn (allow in development, catch in review).
- `no-unused-vars`: error (with `_` prefix exemption for intentionally unused).
- `@typescript-eslint/no-explicit-any`: error.
- `@typescript-eslint/strict-boolean-expressions`: warn.
- `import/order`: auto-fix to enforce import grouping.
- `no-restricted-imports`: prevent circular dependency patterns.

## Fixing

- `npm run lint -- --fix` for auto-fixable issues.
- Manual fixes must not change behavior — style only.
- If a rule produces false positives on valid code, disable per-line with a comment:
  ```typescript
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- validated above
  const value = map.get(key)!
  ```

## CI Integration

- Lint runs first in CI pipeline (fast fail on style issues).
- Lint failures block merge.
- Pre-commit hook runs lint on staged files.

## Adding Rules

- Propose new rules with rationale and example of what they catch.
- Test the rule against the existing codebase for false positives before enabling.
- Start as `warn` for new rules; escalate to `error` after the codebase is clean.
