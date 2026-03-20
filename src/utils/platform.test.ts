import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('isMacPlatform', () => {
  // The module caches the result in a module-level `let`, so we must
  // isolate each import to get a fresh cache.
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('returns true when userAgentData.platform is macOS', async () => {
    vi.stubGlobal('navigator', {
      userAgentData: { platform: 'macOS' },
      platform: 'Win32',
    });
    const { isMacPlatform } = await import('./platform');
    expect(isMacPlatform()).toBe(true);
  });

  it('returns true when navigator.platform contains Mac', async () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    const { isMacPlatform } = await import('./platform');
    expect(isMacPlatform()).toBe(true);
  });

  it('returns true when navigator.platform contains iPad', async () => {
    vi.stubGlobal('navigator', { platform: 'iPad' });
    const { isMacPlatform } = await import('./platform');
    expect(isMacPlatform()).toBe(true);
  });

  it('returns true when navigator.platform contains iPhone', async () => {
    vi.stubGlobal('navigator', { platform: 'iPhone' });
    const { isMacPlatform } = await import('./platform');
    expect(isMacPlatform()).toBe(true);
  });

  it('returns false on Windows', async () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    const { isMacPlatform } = await import('./platform');
    expect(isMacPlatform()).toBe(false);
  });

  it('returns false on Linux', async () => {
    vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
    const { isMacPlatform } = await import('./platform');
    expect(isMacPlatform()).toBe(false);
  });

  it('returns false when navigator is undefined', async () => {
    // Simulate a non-browser environment (e.g. SSR / worker without navigator)
    vi.stubGlobal('navigator', undefined);
    const { isMacPlatform } = await import('./platform');
    expect(isMacPlatform()).toBe(false);
  });

  it('caches the result on subsequent calls', async () => {
    vi.stubGlobal('navigator', {
      userAgentData: { platform: 'macOS' },
      platform: 'MacIntel',
    });
    const { isMacPlatform } = await import('./platform');

    expect(isMacPlatform()).toBe(true);

    // Mutate navigator after the first call — cached value should persist
    vi.stubGlobal('navigator', { platform: 'Win32' });
    expect(isMacPlatform()).toBe(true);
  });
});
