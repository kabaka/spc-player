---
name: conventional-commits
description: Commit message format using Conventional Commits specification — mandatory for all commits.
---

# Conventional Commits

All commits in this project must use Conventional Commits format. This is mandatory and enforced by pre-commit hooks.

## Format

```text
type(scope): description

[optional body]

[optional footer(s)]
```

## Types

| Type | When to Use |
| ---- | ----------- |
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation-only change |
| `style` | Formatting, whitespace (no logic change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Build system or dependency changes |
| `ci` | CI/CD pipeline changes |
| `chore` | Maintenance tasks (tooling, config) |

## Scopes

Use the affected module or feature as scope:

- `player`, `playlist`, `inspector`, `instrument`, `export`, `settings`
- `core`, `audio`, `storage`, `midi`, `wasm`
- `ui`, `a11y`, `pwa`, `ci`, `deps`

## Rules

- Description is imperative mood, lowercase, no period: "add track muting" not "Added track muting."
- Body explains *what* and *why*, not *how*.
- Breaking changes: add `!` after type/scope and include `BREAKING CHANGE:` footer.
- Reference issues in footer: `Fixes #123` or `Refs #456`.
- One logical change per commit. Don't bundle unrelated changes.
- The commit message must make sense without looking at the diff.

## Examples

```text
feat(player): add per-track mute/solo controls

Wire mute/solo toggle buttons to DSP voice enable flags.
Each voice can be independently muted without affecting others.

Refs #42
```

```text
fix(core): correct BRR loop point calculation for odd-length samples

The loop offset was calculated in bytes but compared against a
sample count, causing a 2x error on files with odd sample lengths.

Fixes #87
```
