# Contributing to SPC Player

Thank you for your interest in contributing! This guide covers the essentials for getting started.

## Prerequisites

- **Node.js ≥ 22** — [nodejs.org](https://nodejs.org/)
- **Rust toolchain** with the `wasm32-unknown-unknown` target — [rustup.rs](https://rustup.rs/)

```sh
rustup target add wasm32-unknown-unknown
```

## Setup

```sh
git clone https://github.com/kabaka/spc-player.git
cd spc-player
npm install
npm run build:wasm
npm run dev
```

> **WASM build note:** Always use `npm run build:wasm`, never bare `cargo build`. The npm script explicitly selects rustup's cargo/rustc to avoid conflicts with Homebrew-installed Rust toolchains. Running `cargo build` directly may fail with `can't find crate for core` if Homebrew's cargo is first in your PATH.

## Project Structure

SPC Player is a client-side PWA. The DSP emulation core is written in Rust and compiled to WebAssembly. The UI is React + TypeScript.

```text
src/           Application source code (components, features, audio, store)
crates/        Rust WASM crate (DSP emulation)
docs/          Architecture docs, ADRs, design specs
tests/         Integration and E2E tests
public/        Static assets, PWA manifest
```

See [docs/architecture.md](docs/architecture.md) for the full component map and design rationale.

## Development Workflow

1. Create a feature branch from `main`.
2. Implement your changes with tests.
3. Run the full validation suite (see below).
4. Commit using Conventional Commits format.
5. Open a pull request.

## Code Style

- TypeScript strict mode; no `any` without documented justification.
- Named exports only — no default exports.
- `const` by default; `let` only when reassignment is needed.
- Early returns over nested conditionals.

See [AGENTS.md § Code Style](AGENTS.md#code-style) for the complete style guide.

## Commit Conventions

All commits use [Conventional Commits](https://www.conventionalcommits.org/) format:

```text
type(scope): description
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.

See [AGENTS.md § Commit Conventions](AGENTS.md#commit-conventions) for details.

## Testing

```sh
npm test                # Unit tests (Vitest)
npx playwright test     # E2E tests (Playwright)
npm run validate        # Full CI: lint + typecheck + test + build + E2E
```

Unit tests are colocated with source files (`*.test.ts` / `*.test.tsx`). Integration tests live in `tests/integration/`, E2E tests in `tests/e2e/`.

## Documentation

Project documentation lives in `docs/`. Architecture decisions are recorded as ADRs in `docs/adr/`. Design specifications are in `docs/design/`.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
