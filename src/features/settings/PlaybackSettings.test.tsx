import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/store';

import { PlaybackSettings } from './PlaybackSettings';

describe('PlaybackSettings', () => {
  beforeEach(() => {
    useAppStore.setState({
      defaultLoopCount: 2,
      defaultPlayDuration: 180,
      defaultFadeDuration: 10,
    });
  });

  it('renders all playback default inputs', () => {
    render(<PlaybackSettings />);

    expect(screen.getByLabelText('Default Loop Count')).toBeInTheDocument();
    expect(screen.getByLabelText('Default Play Duration')).toBeInTheDocument();
    expect(screen.getByLabelText('Default Fade Duration')).toBeInTheDocument();
  });

  it('shows current values from store', () => {
    render(<PlaybackSettings />);

    expect(screen.getByLabelText('Default Loop Count')).toHaveValue(2);
    expect(screen.getByLabelText('Default Play Duration')).toHaveValue(180);
    expect(screen.getByLabelText('Default Fade Duration')).toHaveValue(10);
  });

  it('updates loop count in store', () => {
    render(<PlaybackSettings />);

    fireEvent.change(screen.getByLabelText('Default Loop Count'), {
      target: { value: '5' },
    });

    expect(useAppStore.getState().defaultLoopCount).toBe(5);
  });

  it('clamps loop count to valid range', () => {
    render(<PlaybackSettings />);

    fireEvent.change(screen.getByLabelText('Default Loop Count'), {
      target: { value: '150' },
    });

    expect(useAppStore.getState().defaultLoopCount).toBeLessThanOrEqual(99);
  });
});
