---
name: dark-light-mode
description: Theme switching implementation, CSS custom properties, system preference detection, and persistence.
---

# Dark and Light Mode

Use this skill when implementing or reviewing theme switching, system preference detection, or theme persistence.

## System Preference Detection

```typescript
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
```

- Default to system preference on first visit.
- User override persists to IndexedDB.
- Listen for system changes and update if user hasn't set a manual preference.

## Implementation

### CSS Custom Properties

Define all colors as CSS custom properties. Switch themes by changing the root attribute:

```css
:root, [data-theme="light"] {
  --color-bg: var(--light-bg);
  --color-text: var(--light-text);
}

[data-theme="dark"] {
  --color-bg: var(--dark-bg);
  --color-text: var(--dark-text);
}
```

### Theme Toggle

- Use `data-theme` attribute on `<html>` element.
- Three states: light, dark, system (auto).
- UI shows current effective theme and allows override.
- Transition between themes smoothly (short CSS transition on `background-color` and `color`).

### Persistence

- Store user preference in IndexedDB (not localStorage for consistency with other data).
- On app start: check stored preference → apply. If none, detect system preference.
- Preference key: `theme` with values `'light' | 'dark' | 'system'`.

## Contrast Verification

- Verify contrast meets WCAG AA in both themes.
- Test with various system display settings (night mode, high contrast).
- Test on both OLED (true black) and LCD (not-quite-black) screens.

## Transition

- Apply a brief CSS transition (`150ms ease-in-out`) for theme changes.
- Respect `prefers-reduced-motion`: disable transition when set.
- Don't flash the wrong theme on load (apply theme before first paint).

## Testing

- E2E tests should cover theme switching.
- Visual regression tests for both themes.
- Verify no elements are invisible or unreadable in either theme.
