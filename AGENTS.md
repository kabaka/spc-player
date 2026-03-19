# AGENTS.md

## Project

SPC Player is a client-side PWA for playing, analyzing, and exporting SNES SPC music files. There is no backend. All processing runs in the browser via WebAssembly and Web Audio.

## Tech Stack

- TypeScript (strict mode)
- WebAssembly (DSP emulation core)
- Web Audio API + AudioWorklet
- Web MIDI API
- IndexedDB (persistence)
- Service Worker (offline PWA)
- GitHub Actions (CI/CD)
- GitHub Pages (deployment)
- Playwright (E2E testing)

## Repository Structure

```text
src/                  # Application source code
public/               # Static assets, PWA manifest, icons
docs/                 # Project documentation
  adr/                # Architecture Decision Records
  guides/             # User-facing documentation
  dev/                # Developer documentation
.github/
  agents/             # Copilot agent definitions
  skills/             # Copilot skill definitions
  workflows/          # GitHub Actions CI/CD
.ephemeral/           # Gitignored scratch space for agent use
```

## Commands

Commands will be configured during project setup. Placeholder:

- **Install:** `npm install`
- **Dev server:** `npm run dev`
- **Build:** `npm run build`
- **Type check:** `npx tsc --noEmit`
- **Lint:** `npm run lint`
- **Lint fix:** `npm run lint -- --fix`
- **Unit tests:** `npm test`
- **E2E tests:** `npx playwright test`
- **Full CI validation:** `npm run validate`
- **Format:** `npm run format`

## Code Style

- TypeScript strict mode, no `any` unless unavoidable and commented.
- Prefer `const` over `let`. Never use `var`.
- Named exports, no default exports.
- Descriptive names. No abbreviations except well-known ones (e.g., `DSP`, `BRR`, `PCM`).
- Functions over classes unless state encapsulation is needed.
- Keep files small and focused. Code files should not exceed 1000 lines.
- Early returns over nested conditionals.
- Group imports: external libraries → internal modules → types.

## Commit Conventions

All commits must use [Conventional Commits](https://www.conventionalcommits.org/) format:

```text
type(scope): description

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.

## Versioning

Date-based version numbers. Format: `YYYY.MM.DD` with optional `.N` suffix for same-day releases. No formal release cycle — continuous release on green CI.

## Testing

- Unit tests colocated with source files (`*.test.ts`).
- Integration tests in `tests/integration/`.
- E2E tests in `tests/e2e/`.
- Tests must pass before commit. CI enforces this.
- Never delete a failing test. Fix the code or update the test with justification.

## Agent Workflow

This project uses an **orchestrator + expert subagent** execution model. The orchestrator is the only user-facing agent. It delegates all tasks — research, planning, implementation, review, documentation, testing — to specialized subagents.

General workflow for significant tasks:

1. Gather minimal context needed to understand the task.
2. Delegate planning to multiple agents for diverse perspectives.
3. Delegate peer review of plans.
4. Iterate on feedback until plans are solid.
5. Delegate implementation (including tests and docs).
6. Delegate peer review of implementation.
7. Iterate on review feedback.
8. Delegate final readiness checks.
9. Commit changes.

Key conventions:

- Subagents write output to `.ephemeral/` and report file paths — not content — to the orchestrator.
- Independent tasks run in parallel; serialize only when tasks share files or have data dependencies.
- Agents research before planning: gather evidence first, not write from assumptions.
- Reviews require 3+ concurrent reviewers plus a researcher per round. Use more reviewers for complex changes.

The workflow is adaptive — simple questions may skip most steps; complex features use all of them. Implementation tasks always include peer review (steps 6–7). Use judgment, not rigid procedure.

## Boundaries

### Always

- Use conventional commits for every commit.
- Write tests for new functionality.
- Use `.ephemeral/` for scratch files, never `/tmp/`.
- Follow existing code style and patterns.
- Run `npm run validate` (lint, typecheck, tests, build, E2E) before committing. Fix all errors, even in code not touched by the current task.
- Validate SPC file input defensively (untrusted binary data).
- Commit completed work. Do not end a task without committing.
- Activate relevant skills when working in their domain.
- Never use ephemeral review labels (e.g., UX-01, SEC-03) in code, commits, or permanent documentation.

### Ask First

- Adding new dependencies.
- Changing public API contracts.
- Modifying CI/CD pipeline.
- Architectural changes not covered by an existing ADR.
- Deleting files or directories.

### Never

- Commit when CI is red.
- Use `--no-verify` or skip pre-commit hooks.
- Store secrets or credentials in the repository.
- Use `/tmp/` for scratch files.
- Write to directories outside the project root.
- Remove failing tests without fixing the underlying issue.
- Use `eval()` or dynamic code execution.
- Force push to main.
