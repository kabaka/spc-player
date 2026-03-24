import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InstrumentControls } from './InstrumentControls';

describe('InstrumentControls', () => {
  afterEach(() => {
    cleanup();
  });

  const defaultProps = {
    pitchShift: 0,
    gain: 100,
    onPitchShiftChange: vi.fn(),
    onGainChange: vi.fn(),
  };

  it('renders 2 labeled sliders', () => {
    render(<InstrumentControls {...defaultProps} />);
    expect(screen.getByText('Pitch shift')).toBeInTheDocument();
    expect(screen.getByText('Gain')).toBeInTheDocument();
  });

  it('displays formatted pitch shift value text', () => {
    render(<InstrumentControls {...defaultProps} pitchShift={3} />);
    expect(screen.getByText('+3 semitones')).toBeInTheDocument();
  });

  it('displays formatted gain value text', () => {
    render(<InstrumentControls {...defaultProps} gain={120} />);
    expect(screen.getByText('120%')).toBeInTheDocument();
  });

  it('displays zero semitones correctly', () => {
    render(<InstrumentControls {...defaultProps} pitchShift={0} />);
    expect(screen.getByText('0 semitones')).toBeInTheDocument();
  });

  it('displays negative semitones correctly', () => {
    render(<InstrumentControls {...defaultProps} pitchShift={-5} />);
    expect(screen.getByText('-5 semitones')).toBeInTheDocument();
  });
});
