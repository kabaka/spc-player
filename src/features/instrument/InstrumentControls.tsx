import { useId } from 'react';

import { Label } from '@/components/Label/Label';
import { Slider } from '@/components/Slider/Slider';

import styles from './InstrumentControls.module.css';

export interface InstrumentControlsProps {
  pitchShift: number;
  gain: number;
  filterCutoff: number;
  onPitchShiftChange: (value: number) => void;
  onGainChange: (value: number) => void;
  onFilterCutoffChange: (value: number) => void;
}

function formatPitchShift(value: number): string {
  if (value > 0) return `+${value} semitones`;
  if (value < 0) return `${value} semitones`;
  return '0 semitones';
}

function formatGain(value: number): string {
  return `${value}%`;
}

function formatCutoff(value: number): string {
  return `${value}%`;
}

export function InstrumentControls({
  pitchShift,
  gain,
  filterCutoff,
  onPitchShiftChange,
  onGainChange,
  onFilterCutoffChange,
}: InstrumentControlsProps) {
  const pitchId = useId();
  const gainId = useId();
  const cutoffId = useId();

  return (
    <div className={styles.container}>
      <div className={styles.controlGroup}>
        <Label htmlFor={pitchId} className={styles.label}>
          Pitch shift
        </Label>
        <Slider
          value={[pitchShift]}
          onValueChange={([v]) => onPitchShiftChange(v)}
          min={-24}
          max={24}
          step={1}
          aria-labelledby={pitchId}
          aria-valuetext={formatPitchShift(pitchShift)}
        />
        <span className={styles.valueDisplay} aria-hidden="true">
          {formatPitchShift(pitchShift)}
        </span>
      </div>

      <div className={styles.controlGroup}>
        <Label htmlFor={gainId} className={styles.label}>
          Gain
        </Label>
        <Slider
          value={[gain]}
          onValueChange={([v]) => onGainChange(v)}
          min={0}
          max={200}
          step={1}
          aria-labelledby={gainId}
          aria-valuetext={formatGain(gain)}
        />
        <span className={styles.valueDisplay} aria-hidden="true">
          {formatGain(gain)}
        </span>
      </div>

      <div className={styles.controlGroup}>
        <Label htmlFor={cutoffId} className={styles.label}>
          Filter cutoff
        </Label>
        <Slider
          value={[filterCutoff]}
          onValueChange={([v]) => onFilterCutoffChange(v)}
          min={0}
          max={100}
          step={1}
          aria-labelledby={cutoffId}
          aria-valuetext={formatCutoff(filterCutoff)}
        />
        <span className={styles.valueDisplay} aria-hidden="true">
          {formatCutoff(filterCutoff)}
        </span>
      </div>
    </div>
  );
}
