---
name: date-versioning
description: Date-based version numbering scheme for continuous release without formal release cycles.
---

# Date-Based Versioning

This project uses date-based version numbers. There are no formal releases — every green CI build on main is a release.

## Format

```text
YYYY.MM.DD[.N]
```

- `YYYY.MM.DD` — the date of the build.
- `.N` — optional incrementing suffix for multiple releases on the same day (starting at `.1`).

## Examples

- `2026.03.18` — first release on March 18, 2026.
- `2026.03.18.1` — second release on the same day.
- `2026.03.18.2` — third release on the same day.

## Implementation

- Version is generated automatically during CI build, not set manually.
- The version is injected into the build as an environment variable or build constant.
- The PWA manifest and service worker use this version for cache identifiers.
- The version is displayed in the app's settings/about screen.

## Rules

- Never set versions manually. The CI pipeline owns version generation.
- Version is based on UTC date to avoid timezone ambiguity.
- No semantic versioning (semver). No major/minor/patch. No pre-release tags.
- The version serves as both a build identifier and a visible version number for users.
- Changelog is auto-generated from conventional commit messages between versions.
