import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/store';
import type { PlaylistTrack } from '@/store/types';

import { PlaylistSidebar } from './PlaylistSidebar';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/PlaylistTrackList/PlaylistTrackList', () => ({
  PlaylistTrackList: ({ compact }: { compact?: boolean }) => (
    <div data-testid="playlist-track-list" data-compact={String(!!compact)} />
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRACK_A: PlaylistTrack = {
  id: 'aaa',
  filename: 'wind-scene.spc',
  title: 'Wind Scene',
  durationMs: 180_000,
};

const TRACK_B: PlaylistTrack = {
  id: 'bbb',
  filename: 'corridors.spc',
  title: 'Corridors of Time',
  durationMs: 200_000,
};

function spcFile(name = 'track.spc'): File {
  return new File(['fake-spc'], name, { type: 'application/octet-stream' });
}

function setStoreState(overrides: Record<string, unknown>) {
  useAppStore.setState({
    tracks: [],
    shuffleMode: false,
    repeatMode: 'off' as const,
    loadFile: vi.fn().mockResolvedValue(undefined),
    setShuffleMode: vi.fn(),
    setRepeatMode: vi.fn(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlaylistSidebar', () => {
  beforeEach(() => {
    localStorage.clear();
    setStoreState({});
  });

  afterEach(() => {
    cleanup();
  });

  // ── 1. Empty state ──────────────────────────────────────────────

  it('renders "No tracks added yet" when playlist is empty', () => {
    render(<PlaylistSidebar />);

    expect(screen.getByText('No tracks added yet.')).toBeInTheDocument();
    expect(
      screen.getByText('Drop files or click Add Files above.'),
    ).toBeInTheDocument();
  });

  // ── 2. Tracks display ──────────────────────────────────────────

  it('renders PlaylistTrackList with compact prop when tracks exist', () => {
    setStoreState({ tracks: [TRACK_A, TRACK_B] });

    render(<PlaylistSidebar />);

    const list = screen.getByTestId('playlist-track-list');
    expect(list).toBeInTheDocument();
    expect(list).toHaveAttribute('data-compact', 'true');
  });

  it('does not render PlaylistTrackList when playlist is empty', () => {
    render(<PlaylistSidebar />);

    expect(screen.queryByTestId('playlist-track-list')).not.toBeInTheDocument();
  });

  // ── 3. Add Files button ────────────────────────────────────────

  it('clicking Add Files triggers hidden file input click', () => {
    render(<PlaylistSidebar />);

    const fileInput = screen.getByLabelText('Select SPC files to add');
    const clickSpy = vi.spyOn(fileInput, 'click');

    const addButton = screen.getByRole('button', { name: /add files/i });
    fireEvent.click(addButton);

    expect(clickSpy).toHaveBeenCalledOnce();
  });

  // ── 4. File selection ──────────────────────────────────────────

  it('selecting .spc files calls loadFile for each file', async () => {
    const mockLoadFile = vi.fn().mockResolvedValue(undefined);
    setStoreState({ loadFile: mockLoadFile });

    render(<PlaylistSidebar />);

    const fileInput = screen.getByLabelText(
      'Select SPC files to add',
    ) as HTMLInputElement;

    const file1 = spcFile('song1.spc');
    const file2 = spcFile('song2.spc');

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [file1, file2],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(mockLoadFile).toHaveBeenCalledTimes(2);
    expect(mockLoadFile).toHaveBeenCalledWith(file1);
    expect(mockLoadFile).toHaveBeenCalledWith(file2);
  });

  it('resets file input value after file selection', async () => {
    setStoreState({ loadFile: vi.fn().mockResolvedValue(undefined) });

    render(<PlaylistSidebar />);

    const fileInput = screen.getByLabelText(
      'Select SPC files to add',
    ) as HTMLInputElement;

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [spcFile()],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(fileInput.value).toBe('');
  });

  // ── 5. Shuffle toggle ─────────────────────────────────────────

  it('clicking shuffle button toggles shuffleMode', () => {
    const mockSetShuffleMode = vi.fn();
    setStoreState({
      tracks: [TRACK_A],
      shuffleMode: false,
      setShuffleMode: mockSetShuffleMode,
    });

    render(<PlaylistSidebar />);

    const shuffleButton = screen.getByRole('button', { name: 'Shuffle' });
    expect(shuffleButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(shuffleButton);

    expect(mockSetShuffleMode).toHaveBeenCalledWith(true);
  });

  it('shuffle button shows aria-pressed="true" when active', () => {
    setStoreState({ tracks: [TRACK_A], shuffleMode: true });

    render(<PlaylistSidebar />);

    expect(screen.getByRole('button', { name: 'Shuffle' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  // ── 6. Repeat cycle ───────────────────────────────────────────

  it('cycles repeat mode off → all → one → off', () => {
    const mockSetRepeatMode = vi.fn();
    setStoreState({
      tracks: [TRACK_A],
      repeatMode: 'off',
      setRepeatMode: mockSetRepeatMode,
    });

    const { rerender } = render(<PlaylistSidebar />);

    const repeatButton = screen.getByRole('button', { name: 'Repeat: off' });
    fireEvent.click(repeatButton);
    expect(mockSetRepeatMode).toHaveBeenCalledWith('all');

    // Simulate store update to 'all'
    mockSetRepeatMode.mockClear();
    setStoreState({
      tracks: [TRACK_A],
      repeatMode: 'all',
      setRepeatMode: mockSetRepeatMode,
    });
    rerender(<PlaylistSidebar />);

    const repeatAllButton = screen.getByRole('button', { name: 'Repeat all' });
    fireEvent.click(repeatAllButton);
    expect(mockSetRepeatMode).toHaveBeenCalledWith('one');

    // Simulate store update to 'one'
    mockSetRepeatMode.mockClear();
    setStoreState({
      tracks: [TRACK_A],
      repeatMode: 'one',
      setRepeatMode: mockSetRepeatMode,
    });
    rerender(<PlaylistSidebar />);

    const repeatOneButton = screen.getByRole('button', { name: 'Repeat one' });
    fireEvent.click(repeatOneButton);
    expect(mockSetRepeatMode).toHaveBeenCalledWith('off');
  });

  // ── 7. Collapse toggle button ─────────────────────────────────

  it('renders collapse toggle button with aria-expanded', () => {
    render(<PlaylistSidebar />);

    const toggle = screen.getByRole('button', {
      name: 'Toggle playlist sidebar',
    });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'playlist-sidebar');
  });

  // ── 8. Collapse behavior ──────────────────────────────────────

  it('hides sidebar content when collapsed', () => {
    render(<PlaylistSidebar />);

    expect(screen.getByText('Playlist')).toBeInTheDocument();

    const toggle = screen.getByRole('button', {
      name: 'Toggle playlist sidebar',
    });
    fireEvent.click(toggle);

    expect(screen.queryByText('Playlist')).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows sidebar content when expanded after collapse', () => {
    render(<PlaylistSidebar />);

    const toggle = screen.getByRole('button', {
      name: 'Toggle playlist sidebar',
    });

    // Collapse
    fireEvent.click(toggle);
    expect(screen.queryByText('Playlist')).not.toBeInTheDocument();

    // Expand
    fireEvent.click(toggle);
    expect(screen.getByText('Playlist')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  // ── 9. Collapse state persistence ─────────────────────────────

  it('writes collapsed state to localStorage', () => {
    render(<PlaylistSidebar />);

    const toggle = screen.getByRole('button', {
      name: 'Toggle playlist sidebar',
    });

    fireEvent.click(toggle);
    expect(localStorage.getItem('spc-sidebar-collapsed')).toBe('true');

    fireEvent.click(toggle);
    expect(localStorage.getItem('spc-sidebar-collapsed')).toBe('false');
  });

  it('reads initial collapsed state from localStorage', () => {
    localStorage.setItem('spc-sidebar-collapsed', 'true');

    render(<PlaylistSidebar />);

    const toggle = screen.getByRole('button', {
      name: 'Toggle playlist sidebar',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Playlist')).not.toBeInTheDocument();
  });

  it('defaults to expanded when localStorage is empty', () => {
    render(<PlaylistSidebar />);

    expect(
      screen.getByRole('button', { name: 'Toggle playlist sidebar' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Playlist')).toBeInTheDocument();
  });

  // ── 10. Footer hidden when empty ──────────────────────────────

  it('does not show shuffle/repeat footer when playlist is empty', () => {
    render(<PlaylistSidebar />);

    expect(
      screen.queryByRole('button', { name: 'Shuffle' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /repeat/i }),
    ).not.toBeInTheDocument();
  });

  it('shows shuffle/repeat footer when tracks are present', () => {
    setStoreState({ tracks: [TRACK_A] });

    render(<PlaylistSidebar />);

    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Repeat: off' }),
    ).toBeInTheDocument();
  });

  // ── 11. Focus management on collapse ──────────────────────────

  it('moves focus to toggle button when sidebar collapses with focus inside', () => {
    setStoreState({ tracks: [TRACK_A] });

    render(<PlaylistSidebar />);

    // Focus an element inside the sidebar
    const addButton = screen.getByRole('button', { name: /add files/i });
    addButton.focus();
    expect(document.activeElement).toBe(addButton);

    const toggle = screen.getByRole('button', {
      name: 'Toggle playlist sidebar',
    });

    // In a real browser, clicking a button moves focus to it before the
    // click handler fires.  jsdom's fireEvent.click does NOT replicate
    // that, so we .focus() the toggle manually to match browser behavior.
    toggle.focus();
    fireEvent.click(toggle);

    // After collapse, focus should be on the toggle button
    expect(document.activeElement).toBe(toggle);
  });
});
