// ── Media Session API ─────────────────────────────────────────────────
//
// Integrates with the Media Session API to show track info on lock screens,
// headphone controls, and OS media overlays. Wires play/pause/stop/next/prev
// to the Zustand store's playback and playlist orchestration.

import { useEffect } from 'react';

import { audioEngine } from '@/audio/engine';
import { useAppStore } from '@/store/store';

/**
 * Activates Media Session integration. Call this in a component that mounts
 * for the lifetime of playback (e.g., the root layout or player shell).
 *
 * Sets metadata from the current track and registers action handlers.
 */
export const useMediaSession = (): void => {
  const metadata = useAppStore((s) => s.metadata);
  const playbackStatus = useAppStore((s) => s.playbackStatus);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const previousTrack = useAppStore((s) => s.previousTrack);

  // ── Update metadata ───────────────────────────────────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (!metadata) {
      navigator.mediaSession.metadata = null;
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: metadata.title || 'Unknown Track',
      artist: metadata.artist || undefined,
      album: metadata.gameTitle || undefined,
    });
  }, [metadata]);

  // ── Update playback state ─────────────────────────────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const stateMap = {
      playing: 'playing',
      paused: 'paused',
      stopped: 'none',
    } as const;

    navigator.mediaSession.playbackState = stateMap[playbackStatus];
  }, [playbackStatus]);

  // ── Register action handlers ──────────────────────────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      [
        'play',
        () => {
          audioEngine.play();
        },
      ],
      [
        'pause',
        () => {
          audioEngine.pause();
        },
      ],
      [
        'stop',
        () => {
          audioEngine.stop();
        },
      ],
      ['nexttrack', () => void nextTrack()],
      ['previoustrack', () => void previousTrack()],
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some actions may not be supported on all platforms
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Cleanup best-effort
        }
      }
    };
  }, [nextTrack, previousTrack]);
};
