import { useCallback, useEffect, useRef, useState } from 'react';

import { showToast } from '@/components/Toast/toast-store';
import { useAppStore } from '@/store/store';

import styles from './DragDropOverlay.module.css';

type OverlayState = 'idle' | 'visible';

function isSpcFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.spc');
}

function hasFiles(e: DragEvent): boolean {
  return e.dataTransfer?.types.includes('Files') ?? false;
}

export function DragDropOverlay() {
  const [state, setState] = useState<OverlayState>('idle');
  const [announcement, setAnnouncement] = useState('');
  const loadFile = useAppStore((s) => s.loadFile);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterCountRef = useRef(0);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      enterCountRef.current += 1;
      clearLeaveTimer();
      setState('visible');
      setAnnouncement('Drag detected. Drop SPC files to add to playlist.');
    };

    const handleDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      enterCountRef.current -= 1;
      if (enterCountRef.current <= 0) {
        enterCountRef.current = 0;
        clearLeaveTimer();
        leaveTimerRef.current = setTimeout(() => {
          setState('idle');
          setAnnouncement('');
        }, 50);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      enterCountRef.current = 0;
      clearLeaveTimer();
      setState('idle');
      setAnnouncement('');

      const files = Array.from(e.dataTransfer?.files ?? []);
      const spcFiles = files.filter(isSpcFile);

      if (spcFiles.length === 0) return;

      // Load files sequentially — loadFile is async
      let loaded = 0;
      const loadNext = (index: number) => {
        if (index >= spcFiles.length) {
          if (loaded > 0) {
            const noun = loaded === 1 ? 'track' : 'tracks';
            showToast('success', `Added ${loaded} ${noun} to playlist`);
          }
          return;
        }
        loadFile(spcFiles[index])
          .then(() => {
            loaded += 1;
          })
          .catch((err: unknown) => {
            console.error('Failed to load SPC file:', err);
          })
          .finally(() => {
            loadNext(index + 1);
          });
      };
      loadNext(0);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
      clearLeaveTimer();
    };
  }, [loadFile, clearLeaveTimer]);

  return (
    <>
      <div
        className={styles.overlay}
        data-state={state === 'visible' ? 'visible' : 'hidden'}
        aria-hidden="true"
      >
        <div className={styles.card}>
          <span className={styles.icon}>🎮</span>
          <span className={styles.text}>Drop SPC files to play</span>
        </div>
      </div>

      {/* Separate live region for screen reader announcements */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="visually-hidden"
      >
        {announcement}
      </div>
    </>
  );
}
