import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';

import { useAppStore } from '@/store/store';
import { Button } from '@/components/Button/Button';
import { FileDropZone } from '@/components/FileDropZone/FileDropZone';
import { samplesToSeconds, DSP_SAMPLE_RATE } from '@/core/track-duration';
import { audioEngine } from '@/audio/engine';
import { audioStateBuffer } from '@/audio/audio-state-buffer';

import styles from './PlayerView.module.css';

// ── Utility ───────────────────────────────────────────────────────────

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatSpokenTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const parts: string[] = [];
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  if (seconds > 0 || minutes === 0) {
    parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  }
  return parts.join(' ');
}

function formatSeekValueText(elapsedSec: number, durationSec: number): string {
  return `${formatSpokenTime(elapsedSec)} of ${formatSpokenTime(durationSec)}`;
}

// ── Component ─────────────────────────────────────────────────────────

export function PlayerView() {
  const toolbarRef = useRef<HTMLDivElement>(null);

  // ── Unique IDs for aria references ────────────────────────────────
  const seekLabelId = useId();
  const volumeSliderId = useId();
  const speedSliderId = useId();
  const announcementsId = useId();

  // ── Store selectors ───────────────────────────────────────────────
  const playbackStatus = useAppStore((s) => s.playbackStatus);
  const position = useAppStore((s) => s.position);
  const volume = useAppStore((s) => s.volume);
  const speed = useAppStore((s) => s.speed);
  const metadata = useAppStore((s) => s.metadata);
  const trackDuration = useAppStore((s) => s.trackDuration);
  const isLoadingTrack = useAppStore((s) => s.isLoadingTrack);
  const loadingError = useAppStore((s) => s.loadingError);

  const loadFile = useAppStore((s) => s.loadFile);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const previousTrack = useAppStore((s) => s.previousTrack);
  const setPlaybackStatus = useAppStore((s) => s.setPlaybackStatus);
  const setPosition = useAppStore((s) => s.setPosition);
  const setVolume = useAppStore((s) => s.setVolume);
  const setSpeed = useAppStore((s) => s.setSpeed);

  // ── Roving tabindex state (toolbar pattern) ───────────────────────
  const [rovingIndex, setRovingIndex] = useState(1);

  // ── Derived values ────────────────────────────────────────────────
  const totalSeconds = trackDuration?.totalSeconds ?? 0;
  const currentSeconds = Math.floor(samplesToSeconds(position));
  const isPlaying = playbackStatus === 'playing';
  const hasTrack = metadata !== null;

  // ── Sync position from audioStateBuffer during playback ────────────
  useEffect(() => {
    if (!isPlaying) return;

    let rafId: number;
    let lastPosition = -1;
    const sync = () => {
      const pos = audioStateBuffer.positionSamples;
      if (pos !== lastPosition) {
        lastPosition = pos;
        setPosition(pos);
      }
      rafId = requestAnimationFrame(sync);
    };
    rafId = requestAnimationFrame(sync);

    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, setPosition]);

  // ── Playback state announcement ───────────────────────────────────
  const [announcement, setAnnouncement] = useState('');

  // ── Handlers ──────────────────────────────────────────────────────

  const handleFiles = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (file) {
        loadFile(file);
      }
    },
    [loadFile],
  );

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      audioEngine.pause();
      setPlaybackStatus('paused');
      setAnnouncement('Paused');
    } else {
      const started = audioEngine.play();
      if (started) {
        setPlaybackStatus('playing');
        setAnnouncement(`Playing: ${metadata?.title ?? 'Unknown track'}`);
      }
    }
  }, [isPlaying, setPlaybackStatus, metadata]);

  const handleStop = useCallback(() => {
    audioEngine.stop();
    setPlaybackStatus('stopped');
    setPosition(0);
    setAnnouncement('Stopped');
  }, [setPlaybackStatus, setPosition]);

  const handlePrevious = useCallback(() => {
    previousTrack();
  }, [previousTrack]);

  const handleNext = useCallback(() => {
    nextTrack();
  }, [nextTrack]);

  const handleSeek = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const seconds = Number(e.target.value);
      const samples = Math.round(seconds * DSP_SAMPLE_RATE);
      audioEngine.seek(samples);
      setPosition(samples);
    },
    [setPosition],
  );

  const handleVolumeChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value) / 100;
      audioEngine.setVolume(value);
      setVolume(value);
    },
    [setVolume],
  );

  const handleSpeedChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      audioEngine.setSpeed(value);
      setSpeed(value);
    },
    [setSpeed],
  );

  // ── Toolbar keyboard navigation (WAI-ARIA toolbar pattern) ────────
  const handleToolbarKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const toolbar = toolbarRef.current;
      if (!toolbar) return;

      const buttons = Array.from(
        toolbar.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );
      const currentIndex = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );

      if (currentIndex === -1) return;

      let nextIndex: number | null = null;

      switch (e.key) {
        case 'ArrowRight':
          nextIndex = (currentIndex + 1) % buttons.length;
          break;
        case 'ArrowLeft':
          nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = buttons.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      setRovingIndex(nextIndex);
      buttons[nextIndex].focus();
    },
    [],
  );

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className={styles.playerView}>
      {/* File Drop Zone */}
      <FileDropZone onFilesSelected={handleFiles} />

      {/* Loading / Error States */}
      {isLoadingTrack && (
        <div className={styles.loadingIndicator} aria-live="polite">
          Loading track…
        </div>
      )}
      {loadingError && (
        <div className={styles.errorMessage} role="alert">
          {loadingError}
        </div>
      )}

      {/* Now Playing Display */}
      <section className={styles.nowPlaying} aria-label="Now playing">
        {hasTrack ? (
          <>
            <h2 className={styles.trackTitle}>
              {metadata.title || metadata.gameTitle || 'Untitled'}
            </h2>
            <p className={styles.trackDetails}>
              {metadata.gameTitle && (
                <span className={styles.game}>{metadata.gameTitle}</span>
              )}
              {metadata.artist && (
                <span className={styles.artist}>{metadata.artist}</span>
              )}
            </p>
          </>
        ) : (
          <p className={styles.noTrack}>No track loaded</p>
        )}
      </section>

      {/* Transport Controls Toolbar */}
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Playback controls"
        className={styles.toolbar}
        onKeyDown={handleToolbarKeyDown}
      >
        <Button
          variant="icon"
          size="md"
          aria-label="Previous track"
          onClick={handlePrevious}
          disabled={!hasTrack}
          tabIndex={0 === rovingIndex ? 0 : -1}
        >
          ⏮
        </Button>
        <Button
          variant="icon"
          size="md"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={handlePlayPause}
          disabled={!hasTrack}
          tabIndex={1 === rovingIndex ? 0 : -1}
        >
          {isPlaying ? '⏸' : '▶'}
        </Button>
        <Button
          variant="icon"
          size="md"
          aria-label="Stop"
          onClick={handleStop}
          disabled={!hasTrack}
          tabIndex={2 === rovingIndex ? 0 : -1}
        >
          ⏹
        </Button>
        <Button
          variant="icon"
          size="md"
          aria-label="Next track"
          onClick={handleNext}
          disabled={!hasTrack}
          tabIndex={3 === rovingIndex ? 0 : -1}
        >
          ⏭
        </Button>
      </div>

      {/* Seek Bar */}
      <div className={styles.seekBarContainer}>
        <label id={seekLabelId} className={styles.visuallyHidden}>
          Seek
        </label>
        <input
          type="range"
          className={styles.seekBar}
          aria-labelledby={seekLabelId}
          min={0}
          max={Math.floor(totalSeconds)}
          value={Math.min(currentSeconds, Math.floor(totalSeconds))}
          step={5}
          onChange={handleSeek}
          disabled={!hasTrack}
          aria-valuetext={formatSeekValueText(
            currentSeconds,
            Math.floor(totalSeconds),
          )}
        />
      </div>

      {/* Time Display */}
      <div
        className={styles.timeDisplay}
        aria-live="off"
        aria-label="Playback position"
      >
        <span>{formatTime(currentSeconds)}</span>
        <span aria-hidden="true">/</span>
        <span>{formatTime(totalSeconds)}</span>
      </div>

      {/* Volume Control */}
      <div className={styles.controlGroup}>
        <label htmlFor={volumeSliderId} className={styles.controlLabel}>
          Volume
        </label>
        <input
          id={volumeSliderId}
          type="range"
          className={styles.slider}
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          step={1}
          onChange={handleVolumeChange}
          aria-label="Volume"
          aria-valuetext={`${Math.round(volume * 100)}%`}
        />
      </div>

      {/* Speed Control */}
      <div className={styles.controlGroup}>
        <label htmlFor={speedSliderId} className={styles.controlLabel}>
          Speed
        </label>
        <input
          id={speedSliderId}
          type="range"
          className={styles.slider}
          min={0.25}
          max={4}
          value={speed}
          step={0.25}
          onChange={handleSpeedChange}
          aria-label="Playback speed"
          aria-valuetext={`${speed}x`}
        />
      </div>

      {/* Playback State Announcements (screen reader only) */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className={styles.visuallyHidden}
        id={announcementsId}
      >
        {announcement}
      </div>
    </div>
  );
}
