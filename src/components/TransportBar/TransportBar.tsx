import { useCallback, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { useAppStore } from '@/store/store';
import { Button } from '@/components/Button/Button';
import { Slider } from '@/components/Slider/Slider';
import { SeekBar } from '@/components/SeekBar/SeekBar';
import { audioEngine } from '@/audio/engine';
import { samplesToSeconds, DSP_SAMPLE_RATE } from '@/core/track-duration';
import { formatTime } from '@/utils/format-time';

import { formatSubtitle } from '@/utils/format-metadata';

import styles from './TransportBar.module.css';

// ── Component ─────────────────────────────────────────────────────────

export function TransportBar() {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const preMuteVolumeRef = useRef(1);

  // ── Store selectors ───────────────────────────────────────────────
  const playbackStatus = useAppStore((s) => s.playbackStatus);
  const position = useAppStore((s) => s.position);
  const volume = useAppStore((s) => s.volume);
  const metadata = useAppStore((s) => s.metadata);
  const trackDuration = useAppStore((s) => s.trackDuration);
  const loopRegion = useAppStore((s) => s.loopRegion);
  const isLoadingTrack = useAppStore((s) => s.isLoadingTrack);
  const activeIndex = useAppStore((s) => s.activeIndex);

  const setPlaybackStatus = useAppStore((s) => s.setPlaybackStatus);
  const setPosition = useAppStore((s) => s.setPosition);
  const setVolume = useAppStore((s) => s.setVolume);
  const setLoopStart = useAppStore((s) => s.setLoopStart);
  const setLoopEnd = useAppStore((s) => s.setLoopEnd);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const previousTrack = useAppStore((s) => s.previousTrack);
  const playTrackAtIndex = useAppStore((s) => s.playTrackAtIndex);
  const setPlaybackAnnouncement = useAppStore((s) => s.setPlaybackAnnouncement);

  // ── Roving tabindex state ─────────────────────────────────────────
  const [rovingIndex, setRovingIndex] = useState(1); // play/pause is default

  // ── Derived values ────────────────────────────────────────────────
  const totalSeconds = trackDuration?.totalSeconds ?? 0;
  const currentSeconds = Math.floor(samplesToSeconds(position));
  const isPlaying = playbackStatus === 'playing';
  const isMuted = volume === 0;
  const hasTrack = metadata !== null;

  const title = metadata?.title || metadata?.gameTitle || 'Untitled';
  const subtitle = formatSubtitle(
    metadata?.gameTitle ?? '',
    metadata?.artist ?? '',
  );

  // ── Handlers ──────────────────────────────────────────────────────

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      audioEngine.pause();
      setPlaybackStatus('paused');
      setPlaybackAnnouncement('Paused');
    } else {
      const started = audioEngine.play();
      if (started) {
        setPlaybackStatus('playing');
        setPlaybackAnnouncement(
          `Playing: ${metadata?.title ?? 'Unknown track'}`,
        );
      } else if (activeIndex >= 0 && !isLoadingTrack) {
        void playTrackAtIndex(activeIndex);
      }
    }
  }, [
    isPlaying,
    isLoadingTrack,
    setPlaybackStatus,
    setPlaybackAnnouncement,
    metadata,
    activeIndex,
    playTrackAtIndex,
  ]);

  const handlePrevious = useCallback(() => {
    void previousTrack();
  }, [previousTrack]);

  const handleNext = useCallback(() => {
    void nextTrack();
  }, [nextTrack]);

  const handleSeek = useCallback(
    (seconds: number) => {
      const samples = Math.round(seconds * DSP_SAMPLE_RATE);
      audioEngine.seek(samples);
      setPosition(samples);
    },
    [setPosition],
  );

  const handleLoopMarkerChange = useCallback(
    (marker: 'A' | 'B', seconds: number) => {
      if (marker === 'A') {
        setLoopStart(seconds);
      } else {
        setLoopEnd(seconds);
      }
    },
    [setLoopStart, setLoopEnd],
  );

  const handleVolumeChange = useCallback(
    ([rawValue]: number[]) => {
      const value = rawValue / 100;
      audioEngine.setVolume(value);
      setVolume(value);
    },
    [setVolume],
  );

  const handleMuteToggle = useCallback(() => {
    if (isMuted) {
      const restored = preMuteVolumeRef.current || 1;
      audioEngine.setVolume(restored);
      setVolume(restored);
    } else {
      preMuteVolumeRef.current = volume;
      audioEngine.setVolume(0);
      setVolume(0);
    }
  }, [isMuted, volume, setVolume]);

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

  const volumePercent = Math.round(volume * 100);

  return (
    <div id="player-controls" className={styles.transportBar} tabIndex={-1}>
      {/* LEFT ZONE — Track Info Mini */}
      <div className={styles.leftZone} aria-live="polite" aria-atomic="true">
        {hasTrack ? (
          <>
            <div className={styles.thumbnail} aria-hidden="true">
              🎮
            </div>
            <div className={styles.trackText}>
              <p className={styles.trackTitle}>{title}</p>
              {subtitle && <p className={styles.trackSubtitle}>{subtitle}</p>}
            </div>
          </>
        ) : (
          <p className={styles.emptyTrack}>No track loaded</p>
        )}
      </div>

      {/* CENTER ZONE — Transport + Seek
          On mobile: display:contents so seekGroup becomes row 1 (full width)
          and transportButtons joins row 2 alongside left/right zones. */}
      <div className={styles.centerZone}>
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="Playback controls"
          className={styles.transportButtons}
          onKeyDown={handleToolbarKeyDown}
        >
          <Button
            variant="icon"
            size="sm"
            className={styles.prevNextBtn}
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
            className={styles.playPauseBtn}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={handlePlayPause}
            disabled={!hasTrack}
            tabIndex={1 === rovingIndex ? 0 : -1}
          >
            {isPlaying ? '⏸' : '▶'}
          </Button>
          <Button
            variant="icon"
            size="sm"
            className={styles.prevNextBtn}
            aria-label="Next track"
            onClick={handleNext}
            disabled={!hasTrack}
            tabIndex={2 === rovingIndex ? 0 : -1}
          >
            ⏭
          </Button>
        </div>

        <div className={styles.seekGroup}>
          <div className={styles.seekSlider}>
            <SeekBar
              totalSeconds={totalSeconds}
              currentSeconds={currentSeconds}
              onSeek={handleSeek}
              loopRegion={loopRegion}
              onLoopMarkerChange={handleLoopMarkerChange}
              disabled={!hasTrack}
            />
          </div>
          <div
            className={styles.timeDisplay}
            aria-live="off"
            role="group"
            aria-label="Playback position"
          >
            <span>{formatTime(currentSeconds)}</span>
            <span aria-hidden="true">/</span>
            <span>{formatTime(totalSeconds)}</span>
          </div>
        </div>
      </div>

      {/* RIGHT ZONE — Volume */}
      <div className={styles.rightZone}>
        <Button
          variant="icon"
          size="sm"
          className={styles.muteBtn}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          aria-pressed={isMuted}
          onClick={handleMuteToggle}
        >
          {isMuted ? '🔇' : '🔊'}
        </Button>
        <Slider
          className={styles.volumeSlider}
          min={0}
          max={100}
          value={[volumePercent]}
          step={1}
          onValueChange={handleVolumeChange}
          aria-label="Volume"
          aria-valuetext={`${volumePercent}%`}
        />
        <span className={styles.volumePercent} aria-hidden="true">
          {volumePercent}%
        </span>
      </div>
    </div>
  );
}
