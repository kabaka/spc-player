import { useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';

import { audioEngine } from '@/audio/engine';
import { DSP_SAMPLE_RATE, samplesToSeconds } from '@/core/track-duration';
import { useAppStore } from '@/store/store';
import { formatTime } from '@/utils/format-time';

import { useShortcut } from './useShortcut';

const SEEK_SHORT_SAMPLES = DSP_SAMPLE_RATE * 5; // 5 seconds
const SEEK_LONG_SAMPLES = DSP_SAMPLE_RATE * 30; // 30 seconds
const VOLUME_STEP = 0.05;
const SPEED_STEP = 0.25;
const SPEED_MIN = 0.25;
const SPEED_MAX = 4;

export function GlobalShortcuts(): null {
  const loadFile = useAppStore((s) => s.loadFile);
  const setPlaybackStatus = useAppStore((s) => s.setPlaybackStatus);
  const setVolume = useAppStore((s) => s.setVolume);
  const setSpeed = useAppStore((s) => s.setSpeed);
  const setPosition = useAppStore((s) => s.setPosition);
  const toggleMute = useAppStore((s) => s.toggleMute);
  const toggleSolo = useAppStore((s) => s.toggleSolo);
  const resetMixer = useAppStore((s) => s.resetMixer);
  const setRepeatMode = useAppStore((s) => s.setRepeatMode);
  const setShuffleMode = useAppStore((s) => s.setShuffleMode);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const previousTrack = useAppStore((s) => s.previousTrack);
  const setLoopStart = useAppStore((s) => s.setLoopStart);
  const setLoopEnd = useAppStore((s) => s.setLoopEnd);
  const toggleLoop = useAppStore((s) => s.toggleLoop);
  const clearLoop = useAppStore((s) => s.clearLoop);
  const setPlaybackAnnouncement = useAppStore((s) => s.setPlaybackAnnouncement);
  const navigate = useNavigate();
  const preMuteVolumeRef = useRef(1);

  // ── Player controls ─────────────────────────────────────────────────

  useShortcut('playback.playPause', () => {
    const status = useAppStore.getState().playbackStatus;
    if (status === 'playing') {
      audioEngine.pause();
      setPlaybackStatus('paused');
    } else {
      audioEngine.play();
      setPlaybackStatus('playing');
    }
  });

  useShortcut('playback.stop', () => {
    audioEngine.stop();
    setPlaybackStatus('stopped');
    setPosition(0);
  });

  useShortcut('playback.nextTrack', () => {
    nextTrack();
  });

  useShortcut('playback.previousTrack', () => {
    previousTrack();
  });

  // ── Seek ────────────────────────────────────────────────────────────

  useShortcut(
    'playback.seekForward',
    () => {
      const pos = useAppStore.getState().position;
      const newPos = pos + SEEK_SHORT_SAMPLES;
      audioEngine.seek(newPos);
      setPosition(newPos);
    },
    { allowRepeat: true },
  );

  useShortcut(
    'playback.seekBackward',
    () => {
      const pos = useAppStore.getState().position;
      const newPos = Math.max(0, pos - SEEK_SHORT_SAMPLES);
      audioEngine.seek(newPos);
      setPosition(newPos);
    },
    { allowRepeat: true },
  );

  useShortcut(
    'playback.seekForwardLarge',
    () => {
      const pos = useAppStore.getState().position;
      const newPos = pos + SEEK_LONG_SAMPLES;
      audioEngine.seek(newPos);
      setPosition(newPos);
    },
    { allowRepeat: true },
  );

  useShortcut(
    'playback.seekBackwardLarge',
    () => {
      const pos = useAppStore.getState().position;
      const newPos = Math.max(0, pos - SEEK_LONG_SAMPLES);
      audioEngine.seek(newPos);
      setPosition(newPos);
    },
    { allowRepeat: true },
  );

  // ── Volume ──────────────────────────────────────────────────────────

  useShortcut(
    'playback.volumeUp',
    () => {
      const vol = useAppStore.getState().volume;
      const newVol = Math.min(1, vol + VOLUME_STEP);
      audioEngine.setVolume(newVol);
      setVolume(newVol);
    },
    { allowRepeat: true },
  );

  useShortcut(
    'playback.volumeDown',
    () => {
      const vol = useAppStore.getState().volume;
      const newVol = Math.max(0, vol - VOLUME_STEP);
      audioEngine.setVolume(newVol);
      setVolume(newVol);
    },
    { allowRepeat: true },
  );

  useShortcut('playback.mute', () => {
    const vol = useAppStore.getState().volume;
    if (vol > 0) {
      preMuteVolumeRef.current = vol;
      audioEngine.setVolume(0);
      setVolume(0);
    } else {
      const restored = preMuteVolumeRef.current;
      audioEngine.setVolume(restored);
      setVolume(restored);
    }
  });

  // ── Speed ───────────────────────────────────────────────────────────

  useShortcut(
    'playback.speedIncrease',
    () => {
      const spd = useAppStore.getState().speed;
      const newSpd = Math.min(SPEED_MAX, spd + SPEED_STEP);
      audioEngine.setSpeed(newSpd);
      setSpeed(newSpd);
    },
    { allowRepeat: true },
  );

  useShortcut(
    'playback.speedDecrease',
    () => {
      const spd = useAppStore.getState().speed;
      const newSpd = Math.max(SPEED_MIN, spd - SPEED_STEP);
      audioEngine.setSpeed(newSpd);
      setSpeed(newSpd);
    },
    { allowRepeat: true },
  );

  useShortcut('playback.speedReset', () => {
    audioEngine.setSpeed(1);
    setSpeed(1);
  });

  // ── Repeat / Shuffle ────────────────────────────────────────────────

  useShortcut('playback.toggleRepeat', () => {
    const current = useAppStore.getState().repeatMode;
    const next = current === 'off' ? 'all' : current === 'all' ? 'one' : 'off';
    setRepeatMode(next);
  });

  useShortcut('playback.toggleShuffle', () => {
    const current = useAppStore.getState().shuffleMode;
    setShuffleMode(!current);
  });

  // ── A-B Loop ────────────────────────────────────────────────────────

  useShortcut('loop.setStart', () => {
    const pos = useAppStore.getState().position;
    const seconds = samplesToSeconds(pos);
    setLoopStart(seconds);
    setPlaybackAnnouncement(`Loop start set to ${formatTime(seconds)}`);
  });

  useShortcut('loop.setEnd', () => {
    const pos = useAppStore.getState().position;
    const seconds = samplesToSeconds(pos);
    setLoopEnd(seconds);
    setPlaybackAnnouncement(`Loop end set to ${formatTime(seconds)}`);
  });

  useShortcut('loop.toggle', () => {
    toggleLoop();
    const region = useAppStore.getState().loopRegion;
    if (region?.active) {
      setPlaybackAnnouncement(
        `Loop activated from ${formatTime(region.startTime)} to ${formatTime(region.endTime)}`,
      );
    } else {
      setPlaybackAnnouncement('Loop deactivated');
    }
  });

  useShortcut('loop.clear', () => {
    clearLoop();
    setPlaybackAnnouncement('Loop cleared');
  });

  // ── Navigation ──────────────────────────────────────────────────────

  useShortcut('navigation.player', () => {
    navigate({ to: '/' });
  });

  useShortcut('navigation.playlist', () => {
    navigate({ to: '/playlist' });
  });

  useShortcut('navigation.instrument', () => {
    navigate({ to: '/instrument' });
  });

  useShortcut('navigation.analysis', () => {
    navigate({ to: '/analysis' });
  });

  useShortcut('navigation.settings', () => {
    navigate({ to: '/settings' });
  });

  // ── Mixer: voice mute toggles ───────────────────────────────────────

  useShortcut('mixer.toggleVoice1', () => {
    toggleMute(0);
  });

  useShortcut('mixer.toggleVoice2', () => {
    toggleMute(1);
  });

  useShortcut('mixer.toggleVoice3', () => {
    toggleMute(2);
  });

  useShortcut('mixer.toggleVoice4', () => {
    toggleMute(3);
  });

  useShortcut('mixer.toggleVoice5', () => {
    toggleMute(4);
  });

  useShortcut('mixer.toggleVoice6', () => {
    toggleMute(5);
  });

  useShortcut('mixer.toggleVoice7', () => {
    toggleMute(6);
  });

  useShortcut('mixer.toggleVoice8', () => {
    toggleMute(7);
  });

  // ── Mixer: voice solo toggles ───────────────────────────────────────

  useShortcut('mixer.soloVoice1', () => {
    toggleSolo(0);
  });

  useShortcut('mixer.soloVoice2', () => {
    toggleSolo(1);
  });

  useShortcut('mixer.soloVoice3', () => {
    toggleSolo(2);
  });

  useShortcut('mixer.soloVoice4', () => {
    toggleSolo(3);
  });

  useShortcut('mixer.soloVoice5', () => {
    toggleSolo(4);
  });

  useShortcut('mixer.soloVoice6', () => {
    toggleSolo(5);
  });

  useShortcut('mixer.soloVoice7', () => {
    toggleSolo(6);
  });

  useShortcut('mixer.soloVoice8', () => {
    toggleSolo(7);
  });

  // ── Mixer: unmute all ───────────────────────────────────────────────

  useShortcut('mixer.unmuteAll', () => {
    resetMixer();
  });

  // ── General ─────────────────────────────────────────────────────────

  useShortcut('general.toggleFullscreen', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  });

  useShortcut('general.undo', () => {
    // No-op: undo/redo system not yet implemented
  });

  useShortcut('general.redo', () => {
    // No-op: undo/redo system not yet implemented
  });

  // ── Missing action stubs ────────────────────────────────────────────

  useShortcut('navigation.search', () => {
    // No-op: search UI not yet implemented
  });

  useShortcut('export.openDialog', () => {
    const hasTrack = useAppStore.getState().metadata !== null;
    if (hasTrack) {
      useAppStore.getState().setIsExportDialogOpen(true);
    }
  });

  useShortcut('export.quickExport', () => {
    // Quick export v1: opens the dialog (same as Ctrl+E)
    const hasTrack = useAppStore.getState().metadata !== null;
    if (hasTrack) {
      useAppStore.getState().setIsExportDialogOpen(true);
    }
  });

  useShortcut('general.openFile', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.spc';
    input.multiple = true;
    input.addEventListener('change', () => {
      const files = input.files;
      if (files) {
        for (const file of Array.from(files)) {
          loadFile(file);
        }
      }
    });
    input.click();
  });

  useShortcut(
    'general.closeDialog',
    () => {
      // Deactivate instrument mode if active — only update UI after engine confirms
      if (useAppStore.getState().isInstrumentModeActive) {
        audioEngine
          .exitInstrumentMode()
          .then(() => {
            useAppStore.getState().exitInstrumentMode();
            // eslint-disable-next-line @typescript-eslint/no-empty-function
          })
          .catch(() => {});
      }
      // Radix handles Escape for dialogs natively — no further action needed.
    },
    { preventDefault: false },
  );

  useShortcut('general.toggleInstrumentMode', () => {
    const state = useAppStore.getState();
    if (state.isInstrumentModeActive) {
      audioEngine
        .exitInstrumentMode()
        .then(() => {
          useAppStore.getState().exitInstrumentMode();
          // eslint-disable-next-line @typescript-eslint/no-empty-function
        })
        .catch(() => {});
    } else {
      audioEngine
        .enterInstrumentMode()
        .then(async () => {
          useAppStore.getState().enterInstrumentMode();
          try {
            const catalog = await audioEngine.requestSampleCatalog();
            useAppStore.getState().setSampleCatalog(catalog);
            if (catalog.length > 0) {
              useAppStore.getState().setSelectedSrcn(catalog[0].srcn);
              audioEngine.setInstrumentSample(catalog[0].srcn);
            }
          } catch {
            // Sample catalog fetch failed — mode is active but no samples
          }
          // eslint-disable-next-line @typescript-eslint/no-empty-function
        })
        .catch(() => {});
    }
  });

  return null;
}
