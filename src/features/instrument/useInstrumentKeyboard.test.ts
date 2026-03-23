import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useInstrumentKeyboard } from './useInstrumentKeyboard';

function fireKey(
  type: 'keydown' | 'keyup',
  code: string,
  overrides: Partial<KeyboardEvent> = {},
) {
  const event = new KeyboardEvent(type, {
    code,
    bubbles: true,
    cancelable: true,
    ...overrides,
  });
  document.dispatchEvent(event);
  return event;
}

describe('useInstrumentKeyboard', () => {
  const onNoteOn = vi.fn();
  const onNoteOff = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderIt(isActive = false) {
    return renderHook(
      ({ isActive: a }) =>
        useInstrumentKeyboard({ onNoteOn, onNoteOff, isActive: a }),
      { initialProps: { isActive } },
    );
  }

  it('reflects isActive from props', () => {
    const { result, rerender } = renderIt(false);
    expect(result.current.isActive).toBe(false);

    rerender({ isActive: true });
    expect(result.current.isActive).toBe(true);
  });

  it('maps KeyZ to onNoteOn(60, 100) at default octave 4', () => {
    renderIt(true);

    act(() => fireKey('keydown', 'KeyZ'));
    expect(onNoteOn).toHaveBeenCalledWith(60, 100);
  });

  it('fires onNoteOff on key release', () => {
    renderIt(true);

    act(() => fireKey('keydown', 'KeyZ'));
    act(() => fireKey('keyup', 'KeyZ'));
    expect(onNoteOff).toHaveBeenCalledWith(60);
  });

  it('suppresses key repeat events', () => {
    renderIt(true);

    act(() => fireKey('keydown', 'KeyZ'));
    act(() => fireKey('keydown', 'KeyZ', { repeat: true }));
    expect(onNoteOn).toHaveBeenCalledTimes(1);
  });

  it('shifts octave down with Minus key', () => {
    const { result } = renderIt(true);

    expect(result.current.baseOctave).toBe(4);
    act(() => fireKey('keydown', 'Minus'));
    expect(result.current.baseOctave).toBe(3);
  });

  it('shifts octave up with Equal key', () => {
    const { result } = renderIt(true);

    act(() => fireKey('keydown', 'Equal'));
    expect(result.current.baseOctave).toBe(5);
  });

  it('adjusts velocity down with BracketLeft', () => {
    const { result } = renderIt(true);

    expect(result.current.velocity).toBe(100);
    act(() => fireKey('keydown', 'BracketLeft'));
    expect(result.current.velocity).toBe(84);
  });

  it('adjusts velocity up with BracketRight', () => {
    const { result } = renderIt(true);

    act(() => fireKey('keydown', 'BracketRight'));
    expect(result.current.velocity).toBe(116);
  });

  it('does not capture Space (passthrough to playback)', () => {
    renderIt(true);

    act(() => fireKey('keydown', 'Space'));
    expect(onNoteOn).not.toHaveBeenCalled();
  });

  it('does not capture modifier combos', () => {
    renderIt(true);

    act(() => fireKey('keydown', 'KeyZ', { ctrlKey: true }));
    expect(onNoteOn).not.toHaveBeenCalled();
  });

  it('passes through Escape without capturing', () => {
    renderIt(true);

    const event = fireKey('keydown', 'Escape');
    expect(event.defaultPrevented).toBe(false);
    expect(onNoteOn).not.toHaveBeenCalled();
  });

  it('passes through Backquote without capturing', () => {
    renderIt(true);

    const event = fireKey('keydown', 'Backquote');
    expect(event.defaultPrevented).toBe(false);
    expect(onNoteOn).not.toHaveBeenCalled();
  });

  it('releases held notes when isActive becomes false', () => {
    const { rerender } = renderIt(true);

    act(() => fireKey('keydown', 'KeyZ'));
    act(() => fireKey('keydown', 'KeyX'));
    onNoteOff.mockClear();

    rerender({ isActive: false });
    expect(onNoteOff).toHaveBeenCalledWith(60);
    expect(onNoteOff).toHaveBeenCalledWith(62);
  });

  it('releases held notes on deactivate()', () => {
    const { result } = renderIt(true);

    act(() => fireKey('keydown', 'KeyZ'));
    act(() => fireKey('keydown', 'KeyX'));
    onNoteOff.mockClear();

    act(() => result.current.deactivate());
    expect(onNoteOff).toHaveBeenCalledWith(60);
    expect(onNoteOff).toHaveBeenCalledWith(62);
  });

  it('tracks active notes set', () => {
    const { result } = renderIt(true);

    act(() => fireKey('keydown', 'KeyZ'));
    expect(result.current.activeNotes.has(60)).toBe(true);

    act(() => fireKey('keydown', 'KeyX'));
    expect(result.current.activeNotes.has(60)).toBe(true);
    expect(result.current.activeNotes.has(62)).toBe(true);

    act(() => fireKey('keyup', 'KeyZ'));
    expect(result.current.activeNotes.has(60)).toBe(false);
    expect(result.current.activeNotes.has(62)).toBe(true);
  });

  it('does not fire events when inactive', () => {
    renderIt(false);
    act(() => fireKey('keydown', 'KeyZ'));
    expect(onNoteOn).not.toHaveBeenCalled();
  });
});
