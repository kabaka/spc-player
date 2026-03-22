import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/store';

import { AudioQualitySettings } from './AudioQualitySettings';

describe('AudioQualitySettings', () => {
  beforeEach(() => {
    useAppStore.setState({
      resamplingQuality: 'standard',
      audioSampleRate: 48000,
    });
  });

  it('renders preset selector', () => {
    render(<AudioQualitySettings />);

    expect(screen.getByLabelText('Quality Preset')).toBeInTheDocument();
  });

  it('shows custom controls when custom preset selected', () => {
    render(<AudioQualitySettings />);

    fireEvent.change(screen.getByTitle('Quality Preset'), {
      target: { value: 'custom' },
    });

    expect(screen.getByLabelText('Output Resampler')).toBeInTheDocument();
    expect(screen.getByLabelText('Output Sample Rate')).toBeInTheDocument();
    expect(screen.getByLabelText('DSP Interpolation')).toBeInTheDocument();
  });

  it('hides custom controls for standard preset', () => {
    render(<AudioQualitySettings />);

    expect(screen.queryByLabelText('Output Resampler')).not.toBeInTheDocument();
  });

  it('updates store when preset changes', () => {
    render(<AudioQualitySettings />);

    fireEvent.change(screen.getByTitle('Quality Preset'), {
      target: { value: 'high' },
    });

    expect(useAppStore.getState().resamplingQuality).toBe('high');
  });

  it('displays hardware-authentic hint for DSP interpolation', () => {
    useAppStore.setState({ resamplingQuality: 'custom' });
    render(<AudioQualitySettings />);

    expect(
      screen.getByText(/hardware-authentic interpolation method/),
    ).toBeInTheDocument();
  });
});
