---
name: file-organization
description: Project structure conventions, module boundaries, and file placement rules.
---

# File Organization

Use this skill when creating new files, moving code, or evaluating project structure.

## Directory Structure

```text
src/
  app/              # App shell, routing, layout, entry point
  components/       # Shared, reusable UI components
  features/         # Feature modules (self-contained vertical slices)
    player/         # Playback controls, transport, speed
    playlist/       # Playlist management
    inspector/      # Metadata viewer, memory viewer
    instrument/     # Instrument performer, MIDI, keyboard
    export/         # Export UI and format selection
    settings/       # User preferences
  core/             # Domain logic: SPC parsing, DSP bridge, format handling
  audio/            # Web Audio integration, AudioWorklet processor
  storage/          # IndexedDB layer, persistence utilities
  midi/             # Web MIDI integration
  workers/          # Web Worker entry points
  wasm/             # WASM module build config and bindings
  utils/            # Pure utility functions (no side effects)
  types/            # Shared TypeScript type definitions
  hooks/            # Shared React hooks (if using React)
  styles/           # Global styles, theme tokens, CSS utilities
```

## File Placement Rules

- **Feature code** goes in `src/features/{feature}/`. Each feature is a vertical slice: components, hooks, state, tests.
- **Shared components** go in `src/components/` only when used by 2+ features.
- **Domain logic** (SPC parsing, DSP math) goes in `src/core/`. No UI imports.
- **Tests** are colocated: `Component.test.tsx` next to `Component.tsx`.
- **Integration tests** go in `tests/integration/`.
- **E2E tests** go in `tests/e2e/`.
- **Types** shared across modules go in `src/types/`. Feature-local types stay in the feature.

## Naming Conventions

- Files: `kebab-case.ts` for utilities, `PascalCase.tsx` for React components.
- Directories: `kebab-case`.
- Index files: use `index.ts` only as a public API barrel for a module. Keep them minimal.

## Import Rules

- Use path aliases (`@/core/...`, `@/components/...`).
- No circular imports. Enforce with ESLint.
- `core/` must not import from `features/` or `components/`.
- `features/` may import from `core/`, `components/`, `hooks/`, `utils/`, `types/`.
- `components/` may import from `hooks/`, `utils/`, `types/`, `styles/`.
