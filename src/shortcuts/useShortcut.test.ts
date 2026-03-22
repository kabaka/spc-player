import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { shortcutManager } from './ShortcutManager';
import { useShortcut } from './useShortcut';

describe('useShortcut', () => {
  beforeEach(() => {
    shortcutManager.attach();
  });

  afterEach(() => {
    shortcutManager.detach();
  });

  it('registers handler on mount and unregisters on unmount', () => {
    const registerSpy = vi.spyOn(shortcutManager, 'register');
    const unregisterSpy = vi.spyOn(shortcutManager, 'unregister');

    const handler = vi.fn();
    const { unmount } = renderHook(() =>
      useShortcut('playback.playPause', handler),
    );

    expect(registerSpy).toHaveBeenCalledOnce();
    expect(registerSpy).toHaveBeenCalledWith(
      'playback.playPause',
      expect.any(Function),
      expect.objectContaining({ scope: 'global' }),
    );

    unmount();

    expect(unregisterSpy).toHaveBeenCalledOnce();
    expect(unregisterSpy).toHaveBeenCalledWith(
      'playback.playPause',
      expect.any(Function),
    );

    registerSpy.mockRestore();
    unregisterSpy.mockRestore();
  });

  it('passes correct scope to manager', () => {
    const registerSpy = vi.spyOn(shortcutManager, 'register');

    const { unmount } = renderHook(() =>
      useShortcut('playlist.removeTrack', vi.fn(), { scope: 'contextual' }),
    );

    expect(registerSpy).toHaveBeenCalledWith(
      'playlist.removeTrack',
      expect.any(Function),
      expect.objectContaining({ scope: 'contextual' }),
    );

    unmount();
    registerSpy.mockRestore();
  });

  it('does not re-register when handler reference changes', () => {
    const registerSpy = vi.spyOn(shortcutManager, 'register');
    const unregisterSpy = vi.spyOn(shortcutManager, 'unregister');

    let handler = vi.fn();
    const { rerender, unmount } = renderHook(() =>
      useShortcut('playback.playPause', handler),
    );

    expect(registerSpy).toHaveBeenCalledTimes(1);

    // Change handler reference
    handler = vi.fn();
    rerender();

    // Should NOT trigger additional register/unregister
    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(unregisterSpy).not.toHaveBeenCalled();

    unmount();
    registerSpy.mockRestore();
    unregisterSpy.mockRestore();
  });

  it('forwards preventDefault option', () => {
    const registerSpy = vi.spyOn(shortcutManager, 'register');

    const { unmount } = renderHook(() =>
      useShortcut('playback.mute', vi.fn(), { preventDefault: false }),
    );

    expect(registerSpy).toHaveBeenCalledWith(
      'playback.mute',
      expect.any(Function),
      expect.objectContaining({ preventDefault: false }),
    );

    unmount();
    registerSpy.mockRestore();
  });

  it('forwards allowRepeat option', () => {
    const registerSpy = vi.spyOn(shortcutManager, 'register');

    const { unmount } = renderHook(() =>
      useShortcut('playback.seekForward', vi.fn(), { allowRepeat: true }),
    );

    expect(registerSpy).toHaveBeenCalledWith(
      'playback.seekForward',
      expect.any(Function),
      expect.objectContaining({ allowRepeat: true }),
    );

    unmount();
    registerSpy.mockRestore();
  });

  it('calls the latest handler even after re-render', () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    let currentHandler = firstHandler;
    const { rerender } = renderHook(() =>
      useShortcut('playback.playPause', currentHandler),
    );

    // Simulate key press through the manager's resolveKeyEvent
    const event = new KeyboardEvent('keydown', {
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(firstHandler).toHaveBeenCalledOnce();

    // Update handler
    currentHandler = secondHandler;
    rerender();

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'Space',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(secondHandler).toHaveBeenCalledOnce();
    // First handler should NOT have been called again
    expect(firstHandler).toHaveBeenCalledOnce();
  });
});
