import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlaylistTrack } from '@/store/types';
import { useAppStore } from '@/store/store';

import { PlaylistTrackList } from './PlaylistTrackList';

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRACKS: PlaylistTrack[] = [
  {
    id: 'a',
    filename: 'wind-scene.spc',
    title: 'Wind Scene',
    durationMs: 180_000,
  },
  {
    id: 'b',
    filename: 'corridors.spc',
    title: 'Corridors of Time',
    durationMs: 200_000,
  },
  {
    id: 'c',
    filename: 'chrono-trigger.spc',
    title: 'Chrono Trigger',
    durationMs: 150_000,
  },
  {
    id: 'd',
    filename: 'magus.spc',
    title: 'Magus Confronted',
    durationMs: 220_000,
  },
  {
    id: 'e',
    filename: 'world-revolution.spc',
    title: 'World Revolution',
    durationMs: 190_000,
  },
];

function setStoreState(overrides: Record<string, unknown>) {
  useAppStore.setState({
    tracks: TRACKS,
    activeIndex: 0,
    playTrackAtIndex: vi.fn(),
    ...overrides,
  });
}

function getListbox() {
  return screen.getByRole('listbox');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlaylistTrackList type-ahead search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setStoreState({});
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('focuses the first matching track when a single character is typed', () => {
    render(<PlaylistTrackList />);
    const listbox = getListbox();

    fireEvent.keyDown(listbox, { key: 'm' });

    // "Magus Confronted" is the first track starting with 'm'
    expect(listbox.getAttribute('aria-activedescendant')).toContain('track-3');
  });

  it('accumulates characters to match multi-character prefixes', () => {
    render(<PlaylistTrackList />);
    const listbox = getListbox();

    fireEvent.keyDown(listbox, { key: 'c' });
    // First 'c' match is "Corridors of Time" (index 1)
    expect(listbox.getAttribute('aria-activedescendant')).toContain('track-1');

    fireEvent.keyDown(listbox, { key: 'h' });
    // "ch" matches "Chrono Trigger" (index 2)
    expect(listbox.getAttribute('aria-activedescendant')).toContain('track-2');
  });

  it('clears the buffer after the timeout and starts fresh', () => {
    render(<PlaylistTrackList />);
    const listbox = getListbox();

    fireEvent.keyDown(listbox, { key: 'c' });
    expect(listbox.getAttribute('aria-activedescendant')).toContain('track-1');

    // Advance past the 500ms timeout
    vi.advanceTimersByTime(600);

    // Typing 'w' now should match "Wind Scene" (index 0), not "cw"
    fireEvent.keyDown(listbox, { key: 'w' });
    expect(listbox.getAttribute('aria-activedescendant')).toContain('track-0');
  });

  it('does not change focus when no track matches', () => {
    render(<PlaylistTrackList />);
    const listbox = getListbox();

    // Focus starts at index 0
    expect(listbox.getAttribute('aria-activedescendant')).toContain('track-0');

    fireEvent.keyDown(listbox, { key: 'z' });

    // No track starts with 'z', focus stays at index 0
    expect(listbox.getAttribute('aria-activedescendant')).toContain('track-0');
  });

  it('is case-insensitive', () => {
    render(<PlaylistTrackList />);
    const listbox = getListbox();

    fireEvent.keyDown(listbox, { key: 'M' });

    expect(listbox.getAttribute('aria-activedescendant')).toContain('track-3');
  });

  it('does not interfere with arrow key navigation', () => {
    render(<PlaylistTrackList />);
    const listbox = getListbox();

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(listbox.getAttribute('aria-activedescendant')).toContain('track-1');

    fireEvent.keyDown(listbox, { key: 'm' });
    expect(listbox.getAttribute('aria-activedescendant')).toContain('track-3');

    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    expect(listbox.getAttribute('aria-activedescendant')).toContain('track-2');
  });

  it('resets the timer on each keystroke', () => {
    render(<PlaylistTrackList />);
    const listbox = getListbox();

    fireEvent.keyDown(listbox, { key: 'c' });
    vi.advanceTimersByTime(400); // 400ms — not yet expired

    fireEvent.keyDown(listbox, { key: 'h' }); // resets timer, buffer is "ch"
    vi.advanceTimersByTime(400); // 400ms from second keystroke — buffer still active

    // "ch" should still match "Chrono Trigger"
    expect(listbox.getAttribute('aria-activedescendant')).toContain('track-2');

    // Now wait for the full timeout from the last keystroke
    vi.advanceTimersByTime(200);

    // Buffer should be cleared; 'w' matches "Wind Scene"
    fireEvent.keyDown(listbox, { key: 'w' });
    expect(listbox.getAttribute('aria-activedescendant')).toContain('track-0');
  });
});
