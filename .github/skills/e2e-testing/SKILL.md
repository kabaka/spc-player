---
name: e2e-testing
description: End-to-end test authoring with Playwright for complete user workflow verification.
---

# End-to-End Testing

Use this skill when writing Playwright E2E tests that verify complete user workflows. Use Context7 to look up current Playwright API documentation.

## Framework

Playwright. Tests run against the production build, not the dev server.

## Location

- Place in `tests/e2e/`.
- Name files by user workflow: `playback.spec.ts`, `playlist-management.spec.ts`, `export.spec.ts`.

## What to E2E Test

- Complete user workflows: open app → load SPC file → play → mute track → verify audio behavior.
- Playlist management: create, reorder, delete, shuffle.
- Export flow: select file → choose format → export → verify download.
- Settings: change theme → verify persistence across reload.
- PWA: install prompt, offline behavior, update notification.
- Deep linking: navigate to URL → verify correct view and state.
- Keyboard navigation: operate transport controls, navigate playlist.
- File handling: drag-and-drop SPC file, file picker.

## Patterns

### Page Objects

Encapsulate page interactions in page object classes:

```typescript
class PlayerPage {
  constructor(private page: Page) {}

  async loadSpcFile(path: string) {
    /* ... */
  }
  async clickPlay() {
    /* ... */
  }
  async muteTrack(index: number) {
    /* ... */
  }
  async getPlaybackPosition(): Promise<number> {
    /* ... */
  }
}
```

### Test Data

- Use a small set of well-known SPC files as test fixtures.
- Include edge cases: very short files, files with no ID666, files with unusual drivers.
- Store test SPC files in `tests/fixtures/`.

### Assertions

- Verify visible UI state, not internal implementation.
- Use `expect(locator).toBeVisible()`, `toHaveText()`, `toHaveAttribute()`.
- For audio: verify that audio context is running and output is non-silent (spectral check if needed).
- Take screenshots on failure for debugging.

### Cross-Browser

- Run on Chromium by default.
- CI matrix includes WebKit (Safari) for cross-browser coverage.
- Mobile viewports tested via Playwright device emulation.

## Rules

- E2E tests must not be flaky. Use proper waits, not arbitrary timeouts.
- Tests must be independent — no ordering dependencies.
- Clean up any state created during tests.
- E2E tests run last in CI, after unit and integration tests.
- Always run headless (the default). Never use `--headed` or `--ui` mode.
- The HTML reporter is configured with `open: 'never'`. Do not change this.
