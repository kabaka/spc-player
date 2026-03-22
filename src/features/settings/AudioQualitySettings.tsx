import type { ChangeEvent } from 'react';
import { useCallback, useId } from 'react';

import { Label } from '@/components/Label/Label';
import { useAppStore } from '@/store/store';
import type { SettingsSlice } from '@/store/types';

import styles from './AudioQualitySettings.module.css';

// ── Types ─────────────────────────────────────────────────────────────

type Preset = SettingsSlice['resamplingQuality'];
type SampleRate = SettingsSlice['audioSampleRate'];

interface PresetConfig {
  readonly outputResampler: 'linear' | 'sinc';
  readonly outputSampleRate: SampleRate;
  readonly dspInterpolation: string;
}

const PRESET_CONFIGS: Record<Exclude<Preset, 'custom'>, PresetConfig> = {
  standard: {
    outputResampler: 'linear',
    outputSampleRate: 48000,
    dspInterpolation: 'gaussian',
  },
  high: {
    outputResampler: 'sinc',
    outputSampleRate: 48000,
    dspInterpolation: 'gaussian',
  },
};

const RESAMPLER_OPTIONS = [
  { value: 'linear', label: 'Linear' },
  { value: 'sinc', label: 'Sinc (Lanczos-3)' },
] as const;

const SAMPLE_RATE_OPTIONS = [
  { value: 48000, label: '48 kHz' },
  { value: 96000, label: '96 kHz' },
] as const;

const DSP_INTERPOLATION_OPTIONS = [
  { value: 'gaussian', label: 'Gaussian (hardware-authentic)' },
  { value: 'linear', label: 'Linear' },
  { value: 'cubic', label: 'Cubic' },
  { value: 'sinc', label: 'Sinc' },
] as const;

// ── iOS detection ─────────────────────────────────────────────────────

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

// ── Component ─────────────────────────────────────────────────────────

export function AudioQualitySettings() {
  const presetId = useId();
  const resamplerId = useId();
  const sampleRateId = useId();
  const dspInterpId = useId();

  const resamplingQuality = useAppStore((s) => s.resamplingQuality);
  const audioSampleRate = useAppStore((s) => s.audioSampleRate);
  const setResamplingQuality = useAppStore((s) => s.setResamplingQuality);
  const setAudioSampleRate = useAppStore((s) => s.setAudioSampleRate);

  const isCustom = resamplingQuality === 'custom';

  const handlePresetChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const preset = e.target.value as Preset;
      setResamplingQuality(preset);
      if (preset !== 'custom') {
        const config = PRESET_CONFIGS[preset];
        setAudioSampleRate(config.outputSampleRate);
      }
    },
    [setResamplingQuality, setAudioSampleRate],
  );

  const handleSampleRateChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      setAudioSampleRate(Number(e.target.value) as SampleRate);
    },
    [setAudioSampleRate],
  );

  const showIosWarning = isCustom && audioSampleRate === 96000 && isIOS();

  return (
    <div className={styles.container}>
      <div className={styles.field}>
        <Label htmlFor={presetId}>Quality Preset</Label>
        <select
          id={presetId}
          className={styles.select}
          value={resamplingQuality}
          onChange={handlePresetChange}
          title="Quality Preset"
        >
          <option value="standard">Standard</option>
          <option value="high">High Quality</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      {isCustom && (
        <div className={styles.customControls}>
          <div className={styles.field}>
            <Label htmlFor={resamplerId}>Output Resampler</Label>
            <select
              id={resamplerId}
              className={styles.select}
              value="linear"
              onChange={() => {
                /* Resampler mode stored in engine config, not in settings slice yet */
              }}
              title="Output Resampler"
            >
              {RESAMPLER_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <Label htmlFor={sampleRateId}>Output Sample Rate</Label>
            <select
              id={sampleRateId}
              className={styles.select}
              value={audioSampleRate}
              onChange={handleSampleRateChange}
              title="Output Sample Rate"
            >
              {SAMPLE_RATE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {showIosWarning && (
              <div className={styles.warning} role="alert">
                <span className={styles.warningIcon} aria-hidden="true">
                  ⚠️
                </span>
                96 kHz output is not supported on iOS devices
              </div>
            )}
          </div>

          <div className={styles.field}>
            <Label htmlFor={dspInterpId}>DSP Interpolation</Label>
            <select
              id={dspInterpId}
              className={styles.select}
              value="gaussian"
              onChange={() => {
                /* DSP interpolation mode stored in engine config, not in settings slice yet */
              }}
              title="DSP Interpolation"
            >
              {DSP_INTERPOLATION_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className={styles.hint}>
              Gaussian is the hardware-authentic interpolation method
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
