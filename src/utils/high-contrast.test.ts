import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- typeof import() is required for dynamic re-import typing with vi.resetModules()
type HcModule = typeof import('./high-contrast');

let mod: HcModule;

// ── Helpers ────────────────────────────────────────

interface MockMediaQueryList {
  matches: boolean;
  media: string;
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
  _listeners: ((e: MediaQueryListEvent) => void)[];
  _setMatches: (val: boolean) => void;
}

function createMockMediaQueryList(matches: boolean): MockMediaQueryList {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  const mql: MockMediaQueryList = {
    matches,
    media: '(forced-colors: active)',
    onchange: null,
    addEventListener: vi.fn(
      (_event: string, handler: (e: MediaQueryListEvent) => void) => {
        listeners.push(handler);
      },
    ),
    removeEventListener: vi.fn(
      (_event: string, handler: (e: MediaQueryListEvent) => void) => {
        const idx = listeners.indexOf(handler);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    _listeners: listeners,
    _setMatches(val: boolean) {
      mql.matches = val;
      const event = { matches: val } as MediaQueryListEvent;
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
  return mql;
}

// ── Tests ──────────────────────────────────────────

describe('high-contrast', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(async () => {
    originalMatchMedia = window.matchMedia;
    // Reset module registry so the cached MediaQueryList is cleared
    vi.resetModules();
    mod = await import('./high-contrast');
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  describe('isHighContrastActive', () => {
    it('returns false when forced-colors is not active', async () => {
      const mql = createMockMediaQueryList(false);
      window.matchMedia = vi
        .fn()
        .mockReturnValue(mql) as typeof window.matchMedia;
      vi.resetModules();
      const freshMod: HcModule = await import('./high-contrast');
      expect(freshMod.isHighContrastActive()).toBe(false);
    });

    it('reflects the MediaQueryList matches value', async () => {
      const mql = createMockMediaQueryList(false);
      window.matchMedia = vi
        .fn()
        .mockReturnValue(mql) as typeof window.matchMedia;
      vi.resetModules();
      const freshMod: HcModule = await import('./high-contrast');

      expect(freshMod.isHighContrastActive()).toBe(false);

      // Mutate the query to simulate mode change
      mql.matches = true;
      expect(freshMod.isHighContrastActive()).toBe(true);
    });
  });

  describe('getHighContrastColors', () => {
    it('returns an object with all required color keys', () => {
      const colors = mod.getHighContrastColors();
      expect(colors).toEqual(
        expect.objectContaining({
          text: expect.any(String),
          background: expect.any(String),
          highlight: expect.any(String),
          highlightText: expect.any(String),
          buttonText: expect.any(String),
          linkText: expect.any(String),
        }),
      );
    });

    it('returns non-empty color strings', () => {
      const colors = mod.getHighContrastColors();
      for (const value of Object.values(colors)) {
        expect(value.length).toBeGreaterThan(0);
      }
    });

    it('does not leave temporary elements in the DOM', () => {
      const beforeCount = document.body.children.length;
      mod.getHighContrastColors();
      expect(document.body.children.length).toBe(beforeCount);
    });
  });

  describe('onHighContrastChange', () => {
    it('invokes callback on forced-colors change events', async () => {
      const mql = createMockMediaQueryList(false);
      window.matchMedia = vi
        .fn()
        .mockReturnValue(mql) as typeof window.matchMedia;
      vi.resetModules();
      const freshMod: HcModule = await import('./high-contrast');

      const callback = vi.fn();
      freshMod.onHighContrastChange(callback);

      mql._setMatches(true);
      expect(callback).toHaveBeenCalledWith(true);

      mql._setMatches(false);
      expect(callback).toHaveBeenCalledWith(false);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('returns an unsubscribe function that stops notifications', async () => {
      const mql = createMockMediaQueryList(false);
      window.matchMedia = vi
        .fn()
        .mockReturnValue(mql) as typeof window.matchMedia;
      vi.resetModules();
      const freshMod: HcModule = await import('./high-contrast');

      const callback = vi.fn();
      const unsub = freshMod.onHighContrastChange(callback);

      mql._setMatches(true);
      expect(callback).toHaveBeenCalledTimes(1);

      unsub();

      mql._setMatches(false);
      // Should not have been called again after unsubscribe
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('getHighContrast', () => {
    it('returns null when forced-colors is not active', async () => {
      const mql = createMockMediaQueryList(false);
      window.matchMedia = vi
        .fn()
        .mockReturnValue(mql) as typeof window.matchMedia;
      vi.resetModules();
      const freshMod: HcModule = await import('./high-contrast');

      expect(freshMod.getHighContrast()).toBeNull();
    });

    it('returns colors when forced-colors is active', async () => {
      const mql = createMockMediaQueryList(true);
      window.matchMedia = vi
        .fn()
        .mockReturnValue(mql) as typeof window.matchMedia;
      vi.resetModules();
      const freshMod: HcModule = await import('./high-contrast');

      const result = freshMod.getHighContrast();
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('background');
      expect(result).toHaveProperty('highlight');
    });

    it('caches colors across calls', async () => {
      const mql = createMockMediaQueryList(true);
      window.matchMedia = vi
        .fn()
        .mockReturnValue(mql) as typeof window.matchMedia;
      vi.resetModules();
      const freshMod: HcModule = await import('./high-contrast');

      const first = freshMod.getHighContrast();
      const second = freshMod.getHighContrast();
      // Same object reference means it was cached
      expect(first).toBe(second);
    });

    it('invalidates cache when mode changes', async () => {
      const mql = createMockMediaQueryList(true);
      window.matchMedia = vi
        .fn()
        .mockReturnValue(mql) as typeof window.matchMedia;
      vi.resetModules();
      const freshMod: HcModule = await import('./high-contrast');

      const first = freshMod.getHighContrast();
      expect(first).not.toBeNull();

      // Simulate mode deactivation
      mql._setMatches(false);
      expect(freshMod.getHighContrast()).toBeNull();

      // Simulate mode reactivation — should read fresh colors
      mql._setMatches(true);
      mql.matches = true;
      const after = freshMod.getHighContrast();
      expect(after).not.toBeNull();
      // Not the same cached reference since cache was invalidated
      expect(after).not.toBe(first);
    });
  });
});
