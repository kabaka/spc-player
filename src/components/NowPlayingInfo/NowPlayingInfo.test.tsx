import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import type { SpcMetadata } from '@/core/spc-types';
import { useAppStore } from '@/store/store';

import { NowPlayingInfo } from './NowPlayingInfo';

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

describe('NowPlayingInfo', () => {
  beforeEach(() => {
    useAppStore.setState({
      isLoadingTrack: false,
      metadata: null,
      loadingError: null,
    });
  });

  it('renders empty state when no metadata and not loading', () => {
    render(<NowPlayingInfo />);

    expect(screen.getByText('No track loaded')).toBeInTheDocument();
    expect(
      screen.getByText('Drop an SPC file or click Add Files'),
    ).toBeInTheDocument();
  });

  it('renders loading state with shimmer when isLoadingTrack is true', () => {
    useAppStore.setState({ isLoadingTrack: true });

    const { container } = render(<NowPlayingInfo />);

    // Loading layer should be visible
    const stateLayers = container.querySelectorAll('[data-state]');
    const visibleLayers = Array.from(stateLayers).filter(
      (el) => el.getAttribute('data-state') === 'visible',
    );
    expect(visibleLayers).toHaveLength(1);

    // Empty state should be hidden
    expect(
      screen.getByText('No track loaded').closest('[data-state]'),
    ).toHaveAttribute('data-state', 'hidden');
  });

  it('renders track info when metadata is present', () => {
    useAppStore.setState({ metadata: TEST_METADATA });

    render(<NowPlayingInfo />);

    expect(screen.getByText('Wind Scene')).toBeInTheDocument();
    expect(
      screen.getByText('Chrono Trigger · Yasunori Mitsuda'),
    ).toBeInTheDocument();
  });

  it('has aria-busy="true" during loading', () => {
    useAppStore.setState({ isLoadingTrack: true });

    const { container } = render(<NowPlayingInfo />);

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toHaveAttribute('aria-busy', 'true');
  });

  it('does not have aria-busy when not loading', () => {
    const { container } = render(<NowPlayingInfo />);
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toHaveAttribute('aria-busy');
  });

  it('has aria-live="polite" on container', () => {
    const { container } = render(<NowPlayingInfo />);

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
  });

  it('skeleton elements are aria-hidden="true"', () => {
    useAppStore.setState({ isLoadingTrack: true });

    const { container } = render(<NowPlayingInfo />);

    const skeletons = container.querySelectorAll('[aria-hidden="true"]');
    // At least two skeleton bars have aria-hidden
    const skeletonBars = Array.from(skeletons).filter((el) =>
      el.className.includes('skeleton'),
    );
    expect(skeletonBars.length).toBeGreaterThanOrEqual(2);
  });

  it('has SR-only "Loading track" text during loading state', () => {
    useAppStore.setState({ isLoadingTrack: true });

    render(<NowPlayingInfo />);

    expect(screen.getByText('Loading track')).toBeInTheDocument();
    expect(screen.getByText('Loading track')).toHaveClass('visually-hidden');
  });

  it('applies container class for fixed height', () => {
    const { container } = render(<NowPlayingInfo />);

    const wrapper = container.querySelector('[aria-live="polite"]');
    expect(wrapper?.className).toContain('container');
  });

  it('shows "Untitled" when metadata has no title or gameTitle', () => {
    useAppStore.setState({
      metadata: { ...TEST_METADATA, title: '', gameTitle: '' },
    });

    render(<NowPlayingInfo />);

    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  it('falls back to gameTitle when title is empty', () => {
    useAppStore.setState({
      metadata: { ...TEST_METADATA, title: '', gameTitle: 'Final Fantasy VI' },
    });

    render(<NowPlayingInfo />);

    expect(screen.getByText('Final Fantasy VI')).toBeInTheDocument();
  });

  describe('aria-hidden on inactive state layers', () => {
    it('hides loading and has-track layers when in empty state', () => {
      render(<NowPlayingInfo />);

      const { container } = render(<NowPlayingInfo />);
      const layers = container.querySelectorAll('[data-state]');

      // Empty layer (visible) should NOT have aria-hidden
      const emptyLayer = Array.from(layers).find((el) =>
        el.textContent?.includes('No track loaded'),
      );
      expect(emptyLayer).not.toHaveAttribute('aria-hidden');

      // Other layers should have aria-hidden="true"
      const hiddenLayers = Array.from(layers).filter(
        (el) => el.getAttribute('aria-hidden') === 'true',
      );
      expect(hiddenLayers).toHaveLength(2);
    });

    it('hides empty and has-track layers when loading', () => {
      useAppStore.setState({ isLoadingTrack: true });

      const { container } = render(<NowPlayingInfo />);
      const layers = container.querySelectorAll('[data-state]');

      // Loading layer (visible) should NOT have aria-hidden
      const loadingLayer = Array.from(layers).find(
        (el) => el.getAttribute('data-state') === 'visible',
      );
      expect(loadingLayer).not.toHaveAttribute('aria-hidden');

      // Other layers should have aria-hidden="true"
      const hiddenLayers = Array.from(layers).filter(
        (el) =>
          el.getAttribute('data-state') === 'hidden' &&
          el.getAttribute('aria-hidden') === 'true',
      );
      expect(hiddenLayers).toHaveLength(2);
    });

    it('hides empty and loading layers when track is loaded', () => {
      useAppStore.setState({ metadata: TEST_METADATA });

      const { container } = render(<NowPlayingInfo />);
      const layers = container.querySelectorAll('[data-state]');

      // Has-track layer (visible) should NOT have aria-hidden
      const trackLayer = Array.from(layers).find((el) =>
        el.textContent?.includes('Wind Scene'),
      );
      expect(trackLayer).not.toHaveAttribute('aria-hidden');

      // Other layers should have aria-hidden="true"
      expect(
        Array.from(layers).filter(
          (el) =>
            el.getAttribute('data-state') === 'hidden' &&
            el.getAttribute('aria-hidden') === 'true',
        ),
      ).toHaveLength(2);
    });
  });
});
