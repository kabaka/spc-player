import { useEffect, useRef } from 'react';

import { audioEngine } from '@/audio/engine';
import { audioStateBuffer } from '@/audio/audio-state-buffer';
import { samplesToSeconds, DSP_SAMPLE_RATE } from '@/core/track-duration';
import { useAppStore } from '@/store/store';

import type { LoopRegion } from '@/store/types';

/**
 * Root-level rAF loop that syncs `audioStateBuffer.positionSamples`
 * into Zustand and enforces A-B loop regions during playback.
 *
 * Call once in the root component so position updates persist
 * regardless of which view is mounted.
 */
export function usePlaybackPosition(): void {
  const playbackStatus = useAppStore((s) => s.playbackStatus);
  const setPosition = useAppStore((s) => s.setPosition);
  const loopRegion = useAppStore((s) => s.loopRegion);

  // Keep loopRegion in a ref so the rAF callback always reads the latest
  // value without being recreated on every loopRegion change.
  const loopRegionRef = useRef<LoopRegion | null>(loopRegion);
  loopRegionRef.current = loopRegion;

  useEffect(() => {
    if (playbackStatus !== 'playing') return;

    let rafId: number;
    let lastPosition = -1;
    let lastSyncTime = 0;

    const sync = () => {
      const pos = audioStateBuffer.positionSamples;
      if (pos !== lastPosition) {
        lastPosition = pos;

        // Throttle Zustand updates to ≤4 Hz
        const now = performance.now();
        if (now - lastSyncTime >= 250) {
          lastSyncTime = now;
          setPosition(pos);
        }

        // A-B loop enforcement still runs every frame (not throttled)
        const region = loopRegionRef.current;
        if (region?.active) {
          const currentSec = samplesToSeconds(pos);
          if (currentSec >= region.endTime) {
            const targetSamples = Math.round(
              region.startTime * DSP_SAMPLE_RATE,
            );
            audioEngine.seek(targetSamples);
            setPosition(targetSamples);
            lastSyncTime = now;
          }
        }
      }
      rafId = requestAnimationFrame(sync);
    };
    rafId = requestAnimationFrame(sync);

    return () => cancelAnimationFrame(rafId);
  }, [playbackStatus, setPosition]);
}
