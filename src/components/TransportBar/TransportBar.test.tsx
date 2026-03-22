import { Provider as TooltipProvider } from '@radix-ui/react-tooltip';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpcMetadata } from '@/core/spc-types';
import { DSP_SAMPLE_RATE } from '@/core/track-duration';
import { useAppStore } from '@/store/store';

import { TransportBar } from './TransportBar';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/audio/engine', () => ({
  audioEngine: {
    play: vi.fn(() => true),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
  },
}));

vi.mock('@/audio/audio-state-buffer', () => ({
  audioStateBuffer: {
    generation: 0,
    positionSamples: 0,
  },
}));

// Import the mocked engine so we can assert on calls
const { audioEngine } = vi.mocked(await import('@/audio/engine'));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_METADATA: SpcMetadata = {
  title: 'Wind Scene',
  gameTitle: 'Chrono Trigger',
  artist: 'Yasunori Mitsuda',
  dumperName: '',
  comments: '',
  dumpDate: null,
  emulatorUsed: '',
  songLengthSeconds: 180,
  fadeLengthMs: 10000,
  ostTitle: null,
  ostDisc: null,
  ostTrack: null,
  publisher: null,
  copyrightYear: null,
  xid6Timing: null,
  id666Format: 'text',
};

const TRACK_DURATION = {
  playSeconds: 180,
  fadeSeconds: 10,
  totalSeconds: 190,
  hasLoopData: false,
  timingSource: 'id666' as const,
  structure: null,
};

function setStoreWithTrack(overrides: Record<string, unknown> = {}) {
  useAppStore.setState({
    playbackStatus: 'stopped',
    position: 0,
    volume: 0.8,
    metadata: TEST_METADATA,
    trackDuration: TRACK_DURATION,
    isLoadingTrack: false,
    activeIndex: 0,
    ...overrides,
  });
}

function setStoreEmpty(overrides: Record<string, unknown> = {}) {
  useAppStore.setState({
    playbackStatus: 'stopped',
    position: 0,
    volume: 0.8,
    metadata: null,
    trackDuration: null,
    isLoadingTrack: false,
    activeIndex: -1,
    ...overrides,
  });
}

function renderTransportBar() {
  return render(
    <TooltipProvider>
      <TransportBar />
    </TooltipProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TransportBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStoreEmpty();
  });

  // ── Empty state ─────────────────────────────────────────────────────

  it('renders "No track loaded" when no track in store', () => {
    renderTransportBar();

    expect(screen.getByText('No track loaded')).toBeInTheDocument();
  });

  // ── Track info display ──────────────────────────────────────────────

  it('renders title and subtitle when metadata is present', () => {
    setStoreWithTrack();

    renderTransportBar();

    expect(screen.getByText('Wind Scene')).toBeInTheDocument();
    expect(
      screen.getByText('Chrono Trigger · Yasunori Mitsuda · 32kHz · ID666'),
    ).toBeInTheDocument();
  });

  it('renders "Untitled" when metadata has no title or gameTitle', () => {
    setStoreWithTrack({
      metadata: { ...TEST_METADATA, title: '', gameTitle: '' },
    });

    renderTransportBar();

    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  it('falls back to gameTitle when title is empty', () => {
    setStoreWithTrack({
      metadata: { ...TEST_METADATA, title: '', gameTitle: 'Final Fantasy VI' },
    });

    renderTransportBar();

    expect(screen.getByText('Final Fantasy VI')).toBeInTheDocument();
  });

  it('omits subtitle when both gameTitle and artist are empty', () => {
    setStoreWithTrack({
      metadata: { ...TEST_METADATA, gameTitle: '', artist: '' },
    });

    renderTransportBar();

    expect(screen.getByText('Wind Scene')).toBeInTheDocument();
    // Subtitle still shows format info even without gameTitle/artist
    expect(screen.getByText('32kHz · ID666')).toBeInTheDocument();
  });

  // ── Play/pause toggle ──────────────────────────────────────────────

  it('calls audioEngine.play() when clicking play', () => {
    setStoreWithTrack({ playbackStatus: 'paused' });

    renderTransportBar();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(audioEngine.play).toHaveBeenCalledOnce();
    expect(useAppStore.getState().playbackStatus).toBe('playing');
  });

  it('calls audioEngine.pause() when clicking pause', () => {
    setStoreWithTrack({ playbackStatus: 'playing' });

    renderTransportBar();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(audioEngine.pause).toHaveBeenCalledOnce();
    expect(useAppStore.getState().playbackStatus).toBe('paused');
  });

  it('shows Play label when stopped and Pause label when playing', () => {
    setStoreWithTrack({ playbackStatus: 'stopped' });

    const { rerender } = renderTransportBar();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();

    setStoreWithTrack({ playbackStatus: 'playing' });
    rerender(
      <TooltipProvider>
        <TransportBar />
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  // ── Previous / Next track ──────────────────────────────────────────

  it('calls previousTrack() when clicking previous button', () => {
    const previousTrack = vi.fn(() => Promise.resolve());
    setStoreWithTrack();
    useAppStore.setState({ previousTrack });

    renderTransportBar();

    fireEvent.click(screen.getByRole('button', { name: 'Previous track' }));

    expect(previousTrack).toHaveBeenCalledOnce();
  });

  it('calls nextTrack() when clicking next button', () => {
    const nextTrack = vi.fn(() => Promise.resolve());
    setStoreWithTrack();
    useAppStore.setState({ nextTrack });

    renderTransportBar();

    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));

    expect(nextTrack).toHaveBeenCalledOnce();
  });

  // ── Seek bar ───────────────────────────────────────────────────────

  it('calls audioEngine.seek() on seek slider value change', () => {
    setStoreWithTrack({ position: 0 });

    renderTransportBar();

    const seekSlider = screen.getByRole('slider', { name: 'Seek position' });

    // SeekBar's hidden input responds to keyboard events for stepping
    fireEvent.keyDown(seekSlider, { key: 'ArrowRight' });

    // Step is 5 seconds → 5 * DSP_SAMPLE_RATE samples
    expect(audioEngine.seek).toHaveBeenCalledWith(
      Math.round(5 * DSP_SAMPLE_RATE),
    );
  });

  // ── Volume slider ─────────────────────────────────────────────────

  it('calls audioEngine.setVolume() on volume slider change', () => {
    setStoreWithTrack({ volume: 0.5 });

    renderTransportBar();

    const volumeSlider = screen.getByRole('slider', { name: 'Volume' });

    fireEvent.keyDown(volumeSlider, { key: 'ArrowRight' });

    // Volume slider step is 1 (out of 100), so 50 → 51 → 0.51
    expect(audioEngine.setVolume).toHaveBeenCalledWith(0.51);
    expect(useAppStore.getState().volume).toBe(0.51);
  });

  // ── Mute toggle ───────────────────────────────────────────────────

  it('mutes volume when clicking mute button', () => {
    setStoreWithTrack({ volume: 0.75 });

    renderTransportBar();

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));

    expect(audioEngine.setVolume).toHaveBeenCalledWith(0);
    expect(useAppStore.getState().volume).toBe(0);
  });

  it('restores previous volume when clicking unmute', () => {
    setStoreWithTrack({ volume: 0.75 });

    renderTransportBar();

    // Mute first
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(useAppStore.getState().volume).toBe(0);

    // Now unmute — should restore to 0.75
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(audioEngine.setVolume).toHaveBeenLastCalledWith(0.75);
    expect(useAppStore.getState().volume).toBe(0.75);
  });

  it('shows Unmute label and has aria-pressed when muted', () => {
    setStoreWithTrack({ volume: 0 });

    renderTransportBar();

    const muteBtn = screen.getByRole('button', { name: 'Unmute' });
    expect(muteBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows Mute label and aria-pressed=false when not muted', () => {
    setStoreWithTrack({ volume: 0.5 });

    renderTransportBar();

    const muteBtn = screen.getByRole('button', { name: 'Mute' });
    expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
  });

  // ── Disabled state ────────────────────────────────────────────────

  it('disables transport buttons when no track is loaded', () => {
    setStoreEmpty();

    renderTransportBar();

    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Previous track' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next track' })).toBeDisabled();
  });

  it('renders seek slider with max=0 when no track is loaded', () => {
    setStoreEmpty();

    renderTransportBar();

    const seekSlider = screen.getByRole('slider', { name: 'Seek position' });
    expect(seekSlider).toHaveAttribute('aria-valuemax', '0');
  });

  it('enables transport buttons when a track is loaded', () => {
    setStoreWithTrack();

    renderTransportBar();

    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Previous track' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next track' })).toBeEnabled();
  });

  // ── ARIA toolbar role ─────────────────────────────────────────────

  it('has role="toolbar" with aria-label "Playback controls"', () => {
    renderTransportBar();

    const toolbar = screen.getByRole('toolbar', {
      name: 'Playback controls',
    });
    expect(toolbar).toBeInTheDocument();
  });

  // ── Keyboard navigation ───────────────────────────────────────────

  it('moves focus to next button on ArrowRight', () => {
    setStoreWithTrack();

    renderTransportBar();

    const toolbar = screen.getByRole('toolbar', {
      name: 'Playback controls',
    });
    const playBtn = screen.getByRole('button', { name: 'Play' });

    // Focus play/pause button (center of toolbar)
    playBtn.focus();
    expect(playBtn).toHaveFocus();

    // ArrowRight should move to next track button
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Next track' })).toHaveFocus();
  });

  it('moves focus to previous button on ArrowLeft', () => {
    setStoreWithTrack();

    renderTransportBar();

    const toolbar = screen.getByRole('toolbar', {
      name: 'Playback controls',
    });
    const playBtn = screen.getByRole('button', { name: 'Play' });

    playBtn.focus();
    expect(playBtn).toHaveFocus();

    // ArrowLeft should move to previous track button
    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
    expect(
      screen.getByRole('button', { name: 'Previous track' }),
    ).toHaveFocus();
  });

  it('wraps focus from last to first button on ArrowRight', () => {
    setStoreWithTrack();

    renderTransportBar();

    const toolbar = screen.getByRole('toolbar', {
      name: 'Playback controls',
    });
    const nextBtn = screen.getByRole('button', { name: 'Next track' });
    nextBtn.focus();

    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(
      screen.getByRole('button', { name: 'Previous track' }),
    ).toHaveFocus();
  });

  // ── Time display ──────────────────────────────────────────────────

  it('shows formatted current and total time', () => {
    // Position = 90 seconds worth of samples
    setStoreWithTrack({ position: 90 * DSP_SAMPLE_RATE });

    renderTransportBar();

    // Current time: 1:30, Total time: 3:10 (190 seconds)
    expect(screen.getByText('1:30')).toBeInTheDocument();
    expect(screen.getByText('3:10')).toBeInTheDocument();
  });

  it('shows 0:00 / 0:00 when no track is loaded', () => {
    setStoreEmpty();

    renderTransportBar();

    const timeGroup = screen.getByRole('group', { name: 'Playback position' });
    const zeroes = within(timeGroup).getAllByText('0:00');
    expect(zeroes).toHaveLength(2);
  });

  it('displays volume percentage', () => {
    setStoreWithTrack({ volume: 0.65 });

    renderTransportBar();

    expect(screen.getByText('65%')).toBeInTheDocument();
  });
});
