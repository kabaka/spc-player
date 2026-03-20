import { useCallback, useId } from 'react';
import type { ChangeEvent } from 'react';

import { useAppStore } from '@/store/store';
import { Label } from '@/components/Label/Label';
import styles from './ExportDefaultSettings.module.css';

import type { ExportDefaults } from '@/store/types';

// ── Options ───────────────────────────────────────────────────────────

const FORMAT_OPTIONS: readonly {
  value: ExportDefaults['format'];
  label: string;
}[] = [
  { value: 'wav', label: 'WAV' },
  { value: 'flac', label: 'FLAC' },
  { value: 'ogg', label: 'OGG Vorbis' },
  { value: 'mp3', label: 'MP3' },
];

const SAMPLE_RATE_OPTIONS: readonly {
  value: ExportDefaults['sampleRate'];
  label: string;
}[] = [
  { value: 32000, label: '32 kHz' },
  { value: 44100, label: '44.1 kHz' },
  { value: 48000, label: '48 kHz' },
  { value: 96000, label: '96 kHz' },
];

// ── Component ─────────────────────────────────────────────────────────

export function ExportDefaultSettings() {
  const formatId = useId();
  const sampleRateId = useId();
  const loopCountId = useId();

  const exportDefaults = useAppStore((s) => s.exportDefaults);
  const setExportDefaults = useAppStore((s) => s.setExportDefaults);

  const handleFormatChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      setExportDefaults({ format: e.target.value as ExportDefaults['format'] });
    },
    [setExportDefaults],
  );

  const handleSampleRateChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      setExportDefaults({
        sampleRate: Number(e.target.value) as ExportDefaults['sampleRate'],
      });
    },
    [setExportDefaults],
  );

  const handleLoopCountChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = Math.max(1, Math.min(99, Number(e.target.value) || 1));
      setExportDefaults({ loopCount: value });
    },
    [setExportDefaults],
  );

  return (
    <div className={styles.container}>
      <div className={styles.field}>
        <Label htmlFor={formatId}>Export Format</Label>
        <select
          id={formatId}
          className={styles.select}
          value={exportDefaults.format}
          onChange={handleFormatChange}
          title="Export Format"
        >
          {FORMAT_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <Label htmlFor={sampleRateId}>Sample Rate</Label>
        <select
          id={sampleRateId}
          className={styles.select}
          value={exportDefaults.sampleRate}
          onChange={handleSampleRateChange}
          title="Sample Rate"
        >
          {SAMPLE_RATE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <Label htmlFor={loopCountId}>Loop Count</Label>
        <div className={styles.inputRow}>
          <input
            type="number"
            id={loopCountId}
            className={styles.numberInput}
            value={exportDefaults.loopCount}
            onChange={handleLoopCountChange}
            min={1}
            max={99}
            aria-label="Loop Count"
          />
          <span className={styles.unit}>loops</span>
        </div>
      </div>
    </div>
  );
}
