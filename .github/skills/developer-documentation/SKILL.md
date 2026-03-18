---
name: developer-documentation
description: Developer-facing documentation — architecture docs, onboarding guides, API references, and ADRs.
---

# Developer Documentation

Use this skill when writing documentation intended for developers (human or AI) working on SPC Player.

## Audience

Developers contributing to the codebase. Includes AI agents, open-source contributors, and the project owner. Assume TypeScript proficiency but not necessarily SNES audio domain knowledge.

## Documentation Types

### Architecture Documentation

- Lives in `docs/architecture.md`.
- High-level component map with relationships.
- Data flow diagrams for key paths (file load → parse → play).
- Updated when architecture changes.

### ADRs (Architecture Decision Records)

- Format: MADR 4.0.0 (see `adr` skill).
- Stored in `docs/decisions/`.
- Created for every significant technical decision.
- Immutable once accepted — supersede with a new ADR if revisiting.

### API Documentation

- Inline TSDoc comments on all public interfaces.
- Generated API reference from TSDoc (TypeDoc or similar).
- Focus on the "what" and "why", not the "how" (code shows the how).

### Onboarding Guide

A single `CONTRIBUTING.md` or `docs/developer-guide.md` covering:

1. Prerequisites (Node.js, browser).
2. Clone and install.
3. Development server.
4. Project structure overview.
5. How to run tests.
6. How to add a new feature (typical workflow).
7. Commit and PR conventions.

### README.md

- Keep it brief: project description, screenshot, quick start, links to detailed docs.
- Update the status line as the project matures.

## Principles

- **DRY**: don't duplicate what's in the code. Link to source files.
- **Proximity**: keep docs close to the code they describe.
- **Currency**: outdated docs are worse than no docs. Update or delete.
- **Bounded growth**: follow `docs/documentation-plan.md` constraints.

## Code Comments

- Explain "why", not "what".
- Document non-obvious decisions, workarounds, and hardware behavior quirks.
- Use `// TODO:` with a description for planned work (no assignees or dates).
- Use `// HACK:` for intentional workarounds that should be revisited.

## Diagrams

- Use Mermaid syntax for diagrams in markdown (renders on GitHub).
- Keep diagrams simple — if it needs more than 15 nodes, split it.
- Store diagram source in markdown, not as image files.
