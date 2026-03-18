---
name: code-style
description: TypeScript coding conventions, naming patterns, formatting rules, and idioms for this project.
---

# Code Style

Use this skill when writing or reviewing TypeScript code to maintain consistent style across the codebase.

## TypeScript Conventions

### General

- Strict mode enabled. No escape hatches without documented justification.
- `const` by default. `let` only when reassignment is necessary. Never `var`.
- Named exports only. No default exports.
- Prefer functions over classes unless state encapsulation is genuinely needed.
- Early returns over nested conditionals.
- Explicit return types on exported functions. Inferred types for internal functions.

### Naming

- `camelCase` for variables, functions, parameters.
- `PascalCase` for types, interfaces, enums, React components.
- `SCREAMING_SNAKE_CASE` for true constants (compile-time known values).
- Descriptive names. No abbreviations except well-known domain terms: `DSP`, `BRR`, `PCM`, `SPC`, `ADSR`, `MIDI`, `WASM`.
- Boolean variables/props: `is`, `has`, `should`, `can` prefix.
- Event handlers: `on` prefix (`onClick`, `onTrackMute`).

### Imports

Group imports in this order, separated by blank lines:

1. External libraries (`react`, `zustand`, etc.)
2. Internal modules (`@/core/...`, `@/audio/...`)
3. Types (type-only imports with `import type`)

### Error Handling

- Use discriminated unions or Result types for expected failures.
- Throw only for unexpected/unrecoverable errors.
- Never catch and ignore errors silently.

### Comments

- Write code that doesn't need comments.
- When a comment is necessary, explain *why*, not *what*.
- No TODO without a linked issue or ADR reference.
- No commented-out code. Delete it; git has history.

## Formatting

- Prettier handles formatting. Don't fight it.
- 2-space indentation.
- Single quotes for strings.
- Trailing commas in multi-line structures.
- No semicolons (Prettier default, or configure as decided).
