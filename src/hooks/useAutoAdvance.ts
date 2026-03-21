import { useEffect } from 'react';

import { audioEngine } from '@/audio/engine';
import { useAppStore } from '@/store/store';

export function useAutoAdvance(): void {
  useEffect(() => {
    audioEngine.setOnPlaybackEnded(() => {
      useAppStore.getState().nextTrack();
    });
    return () => {
      audioEngine.setOnPlaybackEnded(null);
    };
  }, []);
}
