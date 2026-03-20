import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ChangeEvent } from 'react';

import { useAppStore } from '@/store/store';
import * as Dialog from '@/components/Dialog/Dialog';
import { Button } from '@/components/Button/Button';
import { Label } from '@/components/Label/Label';
import { calculateTrackDuration } from '@/core/track-duration';

import type { TimingDefaults } from '@/core/track-duration';

import styles from './ExportDialog.module.css';

// ── Local types ───────────────────────────────────────────────────────

type ExportFormat = 'wav' | 'flac' | 'ogg' | 'mp3';
type ExportMode = 'fullMix' | 'perTrack' | 'perInstrument' | 'batch';
type SampleRate = 32000 | 44100 | 48000 | 96000;

// ── Constants ─────────────────────────────────────────────────────────

const FORMAT_OPTIONS: readonly { value: ExportFormat; label: string }[] = [
  { value: 'wav', label: 'WAV' },
  { value: 'flac', label: 'FLAC' },
  { value: 'ogg', label: 'OGG' },
  { value: 'mp3', label: 'MP3' },
];

const SAMPLE_RATE_OPTIONS: readonly { value: SampleRate; label: string }[] = [
  { value: 32000, label: '32,000 Hz (native)' },
  { value: 44100, label: '44,100 Hz' },
  { value: 48000, label: '48,000 Hz' },
  { value: 96000, label: '96,000 Hz' },
];

const MODE_OPTIONS: readonly {
  value: ExportMode;
  label: string;
  disabledKey?: 'perInstrument' | 'batch';
  disabledTooltip?: string;
}[] = [
  { value: 'fullMix', label: 'Full Mix' },
  { value: 'perTrack', label: 'Per Track' },
  {
    value: 'perInstrument',
    label: 'Per Instrument',
    disabledKey: 'perInstrument',
    disabledTooltip: 'Per-instrument export coming soon',
  },
  {
    value: 'batch',
    label: 'Batch',
    disabledKey: 'batch',
    disabledTooltip: 'Batch export requires multiple loaded files',
  },
];

const VOICE_COUNT = 8;

// ── Helpers ───────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────

interface ExportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  // ── Unique IDs ──────────────────────────────────────────────────
  const formatGroupId = useId();
  const sampleRateId = useId();
  const modeGroupId = useId();
  const voiceGroupId = useId();
  const loopCountId = useId();
  const fadeId = useId();
  const durationInputId = useId();

  // ── Store selectors ─────────────────────────────────────────────
  const metadata = useAppStore((s) => s.metadata);
  const exportDefaults = useAppStore((s) => s.exportDefaults);
  const defaultLoopCount = useAppStore((s) => s.defaultLoopCount);
  const defaultPlayDuration = useAppStore((s) => s.defaultPlayDuration);
  const defaultFadeDuration = useAppStore((s) => s.defaultFadeDuration);
  const enqueueExport = useAppStore((s) => s.enqueueExport);
  const activeTrackId = useAppStore((s) => s.activeTrackId);
  const playlistTracks = useAppStore((s) => s.tracks);

  // ── Local state ─────────────────────────────────────────────────
  const [format, setFormat] = useState<ExportFormat>(exportDefaults.format);
  const [sampleRate, setSampleRate] = useState<SampleRate>(
    exportDefaults.sampleRate,
  );
  const [mode, setMode] = useState<ExportMode>('fullMix');
  const [voiceMask, setVoiceMask] = useState(0xff);
  const [loopCount, setLoopCount] = useState(defaultLoopCount);
  const [fadeSeconds, setFadeSeconds] = useState(defaultFadeDuration);
  const [flatDuration, setFlatDuration] = useState(defaultPlayDuration);

  // ── Reset state on dialog open ──────────────────────────────────
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setFormat(exportDefaults.format);
      setSampleRate(exportDefaults.sampleRate);
      setMode('fullMix');
      setVoiceMask(0xff);

      const timingDefs: TimingDefaults = {
        durationSeconds: defaultPlayDuration,
        fadeSeconds: defaultFadeDuration,
        loopCount: defaultLoopCount,
      };

      if (metadata) {
        const dur = calculateTrackDuration(
          metadata.xid6Timing,
          metadata.songLengthSeconds,
          metadata.fadeLengthMs,
          null,
          timingDefs,
        );
        setLoopCount(dur.structure?.loopCount ?? defaultLoopCount);
        setFadeSeconds(dur.fadeSeconds);
        setFlatDuration(dur.playSeconds);
      } else {
        setLoopCount(defaultLoopCount);
        setFadeSeconds(defaultFadeDuration);
        setFlatDuration(defaultPlayDuration);
      }
    }
    prevOpenRef.current = open;
  }, [
    open,
    exportDefaults,
    metadata,
    defaultLoopCount,
    defaultPlayDuration,
    defaultFadeDuration,
  ]);

  // ── Timing computation ──────────────────────────────────────────
  const timingDefaults: TimingDefaults = useMemo(
    () => ({
      durationSeconds: defaultPlayDuration,
      fadeSeconds: defaultFadeDuration,
      loopCount: defaultLoopCount,
    }),
    [defaultPlayDuration, defaultFadeDuration, defaultLoopCount],
  );

  const hasXid6Timing =
    metadata?.xid6Timing != null && metadata.xid6Timing.loopLengthTicks > 0;

  const computedDuration = useMemo(() => {
    if (!metadata) return null;
    const override = hasXid6Timing
      ? { loopCount, fadeSeconds }
      : { durationSeconds: flatDuration, fadeSeconds };
    return calculateTrackDuration(
      metadata.xid6Timing,
      metadata.songLengthSeconds,
      metadata.fadeLengthMs,
      override,
      timingDefaults,
    );
  }, [
    metadata,
    hasXid6Timing,
    loopCount,
    fadeSeconds,
    flatDuration,
    timingDefaults,
  ]);

  const structure = computedDuration?.structure ?? null;
  const totalDuration =
    computedDuration?.totalSeconds ?? flatDuration + fadeSeconds;

  // ── Voice toggle ────────────────────────────────────────────────
  const handleVoiceToggle = useCallback((voiceIndex: number) => {
    setVoiceMask((prev) => prev ^ (1 << voiceIndex));
  }, []);

  // ── Form change handlers ────────────────────────────────────────
  const handleFormatChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setFormat(e.target.value as ExportFormat);
  }, []);

  const handleSampleRateChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      setSampleRate(Number(e.target.value) as SampleRate);
    },
    [],
  );

  const handleModeChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setMode(e.target.value as ExportMode);
  }, []);

  const handleLoopCountChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setLoopCount(Math.max(0, Math.min(99, Number(e.target.value) || 0)));
    },
    [],
  );

  const handleFadeChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setFadeSeconds(Math.max(0, Number(e.target.value) || 0));
  }, []);

  const handleDurationChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setFlatDuration(Math.max(1, Number(e.target.value) || 1));
    },
    [],
  );

  // ── Disabled mode checks ─────────────────────────────────────────
  const hasBatchFiles = playlistTracks.length > 1;

  // ── Export handler ──────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!activeTrackId) return;

    const label = metadata?.title || metadata?.gameTitle || 'Unknown Track';
    const spcSource = { type: 'indexeddb' as const, hash: activeTrackId };
    const commonOptions = {
      format,
      sampleRate,
      loopCount,
      fadeSeconds,
      durationSeconds: computedDuration?.playSeconds ?? flatDuration,
    };

    if (mode === 'perTrack') {
      // Enqueue one job per selected voice
      for (let i = 0; i < 8; i++) {
        if (voiceMask & (1 << i)) {
          enqueueExport(
            { ...commonOptions, voiceMask: 1 << i },
            spcSource,
            `${label} - Voice ${i + 1}`,
          );
        }
      }
    } else {
      // fullMix — single job with all voices
      enqueueExport({ ...commonOptions, voiceMask: 0xff }, spcSource, label);
    }

    onOpenChange(false);
  }, [
    format,
    sampleRate,
    loopCount,
    fadeSeconds,
    computedDuration,
    flatDuration,
    voiceMask,
    mode,
    metadata,
    activeTrackId,
    enqueueExport,
    onOpenChange,
  ]);

  // ── Render ──────────────────────────────────────────────────────

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className={styles.dialogContent}>
        <Dialog.Close />
        <Dialog.Title>Export</Dialog.Title>
        <Dialog.Description>
          Configure export settings for the current track.
        </Dialog.Description>

        <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
          {/* Format Selection */}
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend} id={formatGroupId}>
              Format
            </legend>
            <div
              className={styles.formatGroup}
              role="radiogroup"
              aria-labelledby={formatGroupId}
            >
              {FORMAT_OPTIONS.map(({ value, label }) => (
                <label key={value} className={styles.formatOption}>
                  <input
                    type="radio"
                    name="export-format"
                    value={value}
                    checked={format === value}
                    onChange={handleFormatChange}
                    className={styles.radioInput}
                  />
                  <span className={styles.formatLabel}>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Sample Rate */}
          <div className={styles.field}>
            <Label htmlFor={sampleRateId}>Sample Rate</Label>
            <select
              id={sampleRateId}
              className={styles.select}
              value={sampleRate}
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

          {/* Export Type */}
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend} id={modeGroupId}>
              Export Type
            </legend>
            <div
              className={styles.modeGroup}
              role="radiogroup"
              aria-labelledby={modeGroupId}
            >
              {MODE_OPTIONS.map(
                ({ value, label, disabledKey, disabledTooltip }) => {
                  const isDisabled =
                    disabledKey === 'perInstrument' ||
                    (disabledKey === 'batch' && !hasBatchFiles);
                  return (
                    <label
                      key={value}
                      className={styles.modeOption}
                      title={isDisabled ? disabledTooltip : undefined}
                    >
                      <input
                        type="radio"
                        name="export-mode"
                        value={value}
                        checked={mode === value}
                        onChange={handleModeChange}
                        disabled={isDisabled}
                      />
                      <span>{label}</span>
                    </label>
                  );
                },
              )}
            </div>
          </fieldset>

          {/* Voice Selection — per-track mode only */}
          {mode === 'perTrack' && (
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend} id={voiceGroupId}>
                Voices
              </legend>
              <div className={styles.voiceGrid} aria-labelledby={voiceGroupId}>
                {Array.from({ length: VOICE_COUNT }, (_, i) => (
                  <label key={i} className={styles.voiceOption}>
                    <input
                      type="checkbox"
                      checked={(voiceMask & (1 << i)) !== 0}
                      onChange={() => handleVoiceToggle(i)}
                    />
                    <span className={styles.voiceLabel} data-voice={i}>
                      Voice {i + 1}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* Duration Controls */}
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Duration</legend>

            {hasXid6Timing && structure ? (
              <div className={styles.durationGrid}>
                <div className={styles.durationRow}>
                  <span className={styles.durationLabel}>Intro</span>
                  <span className={styles.durationValue}>
                    {formatDuration(structure.introSeconds)}
                  </span>
                </div>
                <div className={styles.durationRow}>
                  <span className={styles.durationLabel}>Loop</span>
                  <span className={styles.durationValue}>
                    {formatDuration(structure.loopSeconds)}
                  </span>
                </div>
                <div className={styles.durationRow}>
                  <Label htmlFor={loopCountId} className={styles.durationLabel}>
                    Loop Count
                  </Label>
                  <input
                    id={loopCountId}
                    type="number"
                    min={0}
                    max={99}
                    value={loopCount}
                    onChange={handleLoopCountChange}
                    className={styles.numberInput}
                    aria-label="Loop Count"
                    aria-describedby={`${loopCountId}-hint`}
                  />
                  <span id={`${loopCountId}-hint`} className={styles.fieldHint}>
                    0–99
                  </span>
                </div>
                <div className={styles.durationRow}>
                  <span className={styles.durationLabel}>End</span>
                  <span className={styles.durationValue}>
                    {formatDuration(structure.endSeconds)}
                  </span>
                </div>
                <div className={styles.durationRow}>
                  <Label htmlFor={fadeId} className={styles.durationLabel}>
                    Fade
                  </Label>
                  <input
                    id={fadeId}
                    type="number"
                    min={0}
                    step={0.5}
                    value={fadeSeconds}
                    onChange={handleFadeChange}
                    className={styles.numberInput}
                    aria-label="Fade duration in seconds"
                  />
                  <span className={styles.fieldUnit}>seconds</span>
                </div>
                <div className={styles.totalRow}>
                  <span className={styles.durationLabel}>Total</span>
                  <span className={styles.durationValue}>
                    {formatDuration(totalDuration)}
                  </span>
                </div>
              </div>
            ) : (
              <div className={styles.durationGrid}>
                <div className={styles.durationRow}>
                  <Label
                    htmlFor={durationInputId}
                    className={styles.durationLabel}
                  >
                    Duration
                  </Label>
                  <input
                    id={durationInputId}
                    type="number"
                    min={1}
                    value={flatDuration}
                    onChange={handleDurationChange}
                    className={styles.numberInput}
                    aria-label="Duration in seconds"
                  />
                  <span className={styles.fieldUnit}>seconds</span>
                </div>
                <div className={styles.durationRow}>
                  <Label htmlFor={fadeId} className={styles.durationLabel}>
                    Fade
                  </Label>
                  <input
                    id={fadeId}
                    type="number"
                    min={0}
                    step={0.5}
                    value={fadeSeconds}
                    onChange={handleFadeChange}
                    className={styles.numberInput}
                    aria-label="Fade duration in seconds"
                  />
                  <span className={styles.fieldUnit}>seconds</span>
                </div>
                <div className={styles.totalRow}>
                  <span className={styles.durationLabel}>Total</span>
                  <span className={styles.durationValue}>
                    {formatDuration(totalDuration)}
                  </span>
                </div>
              </div>
            )}
          </fieldset>

          {/* Actions */}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleExport}
              disabled={
                !activeTrackId || (mode === 'perTrack' && voiceMask === 0)
              }
            >
              Export
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
