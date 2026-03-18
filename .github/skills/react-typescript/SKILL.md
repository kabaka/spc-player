---
name: react-typescript
description: React and TypeScript patterns, hooks, component design, and state management conventions.
---

# React + TypeScript

Use this skill when building or reviewing React components with TypeScript. Use Context7 to look up current React and TypeScript documentation when dealing with complex patterns or recent API changes.

## Component Patterns

### Function Components

All components are function components. No class components.

```tsx
export function TrackList({ tracks, onMute }: TrackListProps) {
  // component logic
}
```

- Named exports, no default exports.
- Props interface named `{Component}Props`.
- Destructure props in the parameter list.
- Return JSX directly or `null`. Never return `undefined`.

### Hooks

- Custom hooks go in `hooks/` (shared) or colocated with the feature.
- Custom hook names start with `use`.
- Hooks must handle cleanup (return cleanup function from `useEffect`).
- Avoid `useEffect` for derived state — use `useMemo` or compute inline.
- Use `useCallback` for handlers passed to child components.

### State Management

- Local state for component-only concerns.
- Shared state via the chosen state library (Zustand, Jotai, etc.).
- No prop drilling past two levels — lift to shared state or use context.
- Keep state minimal: derive what you can, store only what you must.

## TypeScript Integration

- Strict mode enabled. No `any` at component boundaries.
- Use `React.ReactNode` for children. Use specific types where possible.
- Event handlers: use React's event types (`React.MouseEvent`, `React.ChangeEvent<HTMLInputElement>`).
- Ref types: `React.RefObject<HTMLElement>` for read-only, `React.MutableRefObject` for mutable.

## Accessibility

- Use semantic HTML elements (`button`, `nav`, `main`, `section`).
- Add `aria-label` where visual context is missing.
- Manage focus on route changes and modal open/close.
- Test keyboard navigation for every interactive component.

## Performance

- Use `React.memo` only when profiling shows unnecessary re-renders.
- Lazy-load feature routes with `React.lazy` and `Suspense`.
- Avoid creating objects/arrays in render — memoize or move to module scope.
