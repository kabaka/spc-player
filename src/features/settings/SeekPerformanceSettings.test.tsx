import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useAppStore } from '@/store/store';

vi.mock('@/audio/engine', () => ({
  audioEngine: {
    setCheckpointConfig: vi.fn(),
  },
}));

import { audioEngine } from '@/audio/engine';

import { SeekPerformanceSettings } from './SeekPerformanceSettings';

describe('SeekPerformanceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ checkpointPreset: 'standard' });
  });

  it('renders both preset options', () => {
    render(<SeekPerformanceSettings />);

    expect(screen.getByLabelText(/standard/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fast/i)).toBeInTheDocument();
  });

  it('reflects current preset from store', () => {
    useAppStore.setState({ checkpointPreset: 'standard' });
    render(<SeekPerformanceSettings />);

    expect(screen.getByLabelText(/standard/i)).toBeChecked();
    expect(screen.getByLabelText(/fast/i)).not.toBeChecked();
  });

  it('updates store when preset is changed', () => {
    render(<SeekPerformanceSettings />);

    fireEvent.click(screen.getByLabelText(/fast/i));

    expect(useAppStore.getState().checkpointPreset).toBe('fast');
  });

  it('sends checkpoint config to engine on mount', () => {
    render(<SeekPerformanceSettings />);

    expect(audioEngine.setCheckpointConfig).toHaveBeenCalledWith(
      5 * 32_000, // standard: 5s interval
      120, // standard: 120 max
    );
  });

  it('sends updated config to engine when preset changes', () => {
    const { rerender } = render(<SeekPerformanceSettings />);
    vi.clearAllMocks();

    useAppStore.setState({ checkpointPreset: 'fast' });
    rerender(<SeekPerformanceSettings />);

    expect(audioEngine.setCheckpointConfig).toHaveBeenCalledWith(
      2 * 32_000, // fast: 2s interval
      300, // fast: 300 max
    );
  });

  it('has proper radiogroup role and accessible name', () => {
    render(<SeekPerformanceSettings />);

    expect(
      screen.getByRole('group', { name: /seek performance/i }),
    ).toBeInTheDocument();
  });
});
