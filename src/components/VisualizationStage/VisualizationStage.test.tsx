import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/store';

import {
  VisualizationStage,
  VisualizationStageFallback,
} from './VisualizationStage';

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock('@/audio/audio-state-buffer', () => ({
  audioStateBuffer: {
    voices: Array.from({ length: 8 }, (_, i) => ({
      index: i,
      envelopePhase: 'silent',
      envelopeLevel: 0,
      pitch: 0,
      sampleSource: 0,
      keyOn: false,
      active: false,
    })),
    vuLeft: new Float32Array(8),
    vuRight: new Float32Array(8),
    stereoLeft: new Float32Array(8),
    stereoRight: new Float32Array(8),
    masterVuLeft: 0,
    masterVuRight: 0,
    generation: 0,
    positionSamples: 0,
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────

function resetStore() {
  useAppStore.setState({
    activeMode: 'piano-roll',
    metadata: null,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('VisualizationStage', () => {
  beforeEach(() => {
    resetStore();
  });

  // ── Tab bar rendering ───────────────────────────────────────────

  it('renders a tablist with five tabs', () => {
    render(<VisualizationStage />);

    const tablist = screen.getByRole('tablist', {
      name: /visualization modes/i,
    });
    expect(tablist).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);

    expect(tabs[0]).toHaveTextContent('Piano Roll');
    expect(tabs[1]).toHaveTextContent('Spectrum');
    expect(tabs[2]).toHaveTextContent('Stereo Field');
    expect(tabs[3]).toHaveTextContent('Cover Art');
    expect(tabs[4]).toHaveTextContent('Voice Timeline');
  });

  it('marks the active tab as selected', () => {
    render(<VisualizationStage />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[3]).toHaveAttribute('aria-selected', 'false');
  });

  it('only the active tab has tabIndex 0', () => {
    render(<VisualizationStage />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
  });

  // ── Tab switching ───────────────────────────────────────────────

  it('switches active tab on click', () => {
    render(<VisualizationStage />);

    const spectrumTab = screen.getByRole('tab', { name: 'Spectrum' });
    fireEvent.click(spectrumTab);

    expect(spectrumTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Piano Roll' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('updates the store activeMode on tab click', () => {
    render(<VisualizationStage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Cover Art' }));
    expect(useAppStore.getState().activeMode).toBe('cover-art');
  });

  // ── Keyboard navigation ─────────────────────────────────────────

  it('moves to next tab on ArrowRight', () => {
    render(<VisualizationStage />);

    const pianoTab = screen.getByRole('tab', { name: 'Piano Roll' });
    fireEvent.keyDown(pianoTab, { key: 'ArrowRight' });

    expect(useAppStore.getState().activeMode).toBe('spectrum');
  });

  it('moves to previous tab on ArrowLeft', () => {
    render(<VisualizationStage />);

    const pianoTab = screen.getByRole('tab', { name: 'Piano Roll' });
    fireEvent.keyDown(pianoTab, { key: 'ArrowLeft' });

    // Wraps to last tab
    expect(useAppStore.getState().activeMode).toBe('voice-timeline');
  });

  it('moves to first tab on Home', () => {
    useAppStore.setState({ activeMode: 'voice-timeline' });
    render(<VisualizationStage />);

    const timelineTab = screen.getByRole('tab', { name: 'Voice Timeline' });
    fireEvent.keyDown(timelineTab, { key: 'Home' });

    expect(useAppStore.getState().activeMode).toBe('piano-roll');
  });

  it('moves to last tab on End', () => {
    render(<VisualizationStage />);

    const pianoTab = screen.getByRole('tab', { name: 'Piano Roll' });
    fireEvent.keyDown(pianoTab, { key: 'End' });

    expect(useAppStore.getState().activeMode).toBe('voice-timeline');
  });

  // ── ARIA attributes ─────────────────────────────────────────────

  it('renders canvas container with role="img" and aria-label', () => {
    render(<VisualizationStage />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute(
      'aria-label',
      'Piano roll visualization showing active voices',
    );
  });

  it('updates aria-label when switching to spectrum', () => {
    render(<VisualizationStage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Spectrum' }));

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('aria-label', 'Frequency spectrum analyzer');
  });

  it('includes game title in cover art aria-label', () => {
    useAppStore.setState({
      activeMode: 'cover-art',
      metadata: {
        title: 'Wind Scene',
        gameTitle: 'Chrono Trigger',
        artist: '',
        dumperName: '',
        comments: '',
        dumpDate: null,
        emulatorUsed: '',
        songLengthSeconds: 0,
        fadeLengthMs: 0,
        ostTitle: null,
        ostDisc: null,
        ostTrack: null,
        publisher: null,
        copyrightYear: null,
        xid6Timing: null,
        id666Format: 'text',
      },
    });

    render(<VisualizationStage />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('aria-label', 'Cover art for Chrono Trigger');
  });

  it('renders canvas with aria-hidden="true"', () => {
    render(<VisualizationStage />);

    const canvas = document.querySelector('canvas');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  // ── Tab panel ARIA ──────────────────────────────────────────────

  it('links tab to panel via aria-controls and aria-labelledby', () => {
    render(<VisualizationStage />);

    const activeTab = screen.getByRole('tab', { name: 'Piano Roll' });
    const panel = screen.getByRole('tabpanel');

    const panelId = panel.getAttribute('id');
    expect(activeTab).toHaveAttribute('aria-controls', panelId);
    expect(panel).toHaveAttribute('aria-labelledby', activeTab.id);
  });

  // ── Skip link ───────────────────────────────────────────────────

  it('renders a skip visualization link', () => {
    render(<VisualizationStage />);

    const skipLink = screen.getByText('Skip visualization');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#after-visualization');
  });

  it('renders the skip target element', () => {
    render(<VisualizationStage />);

    const target = document.getElementById('after-visualization');
    expect(target).toBeInTheDocument();
  });
});

describe('VisualizationStageFallback', () => {
  it('renders a shimmer placeholder with aria-hidden', () => {
    render(<VisualizationStageFallback />);

    const fallback = document.querySelector('[aria-hidden="true"]');
    expect(fallback).toBeInTheDocument();
  });
});
