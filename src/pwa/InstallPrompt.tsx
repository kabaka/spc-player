import { useState, useEffect, useCallback } from 'react';

import { onSwUpdate, applySwUpdate } from './sw-registration';
import type { SwUpdateState } from './sw-registration';
import styles from './InstallPrompt.module.css';

const DISMISS_KEY = 'spc-install-dismissed';

// ── BeforeInstallPromptEvent ──────────────────────────────────────────
// This event is non-standard (Chromium only) and not in lib.dom.d.ts.

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt(): Promise<void>;
}

// ── Install Banner ────────────────────────────────────────────────────

export const InstallPrompt = (): React.ReactElement | null => {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handler = (e: Event): void => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const result = await installEvent.userChoice;
    if (result.outcome === 'accepted') {
      setInstallEvent(null);
    }
  }, [installEvent]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setInstallEvent(null);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Storage unavailable — dismiss for this session only
    }
  }, []);

  if (!installEvent || dismissed) {
    return null;
  }

  return (
    <div
      className={styles.banner}
      role="complementary"
      aria-label="App install"
    >
      <p className={styles.text}>Install SPC Player for offline access</p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.installButton}
          onClick={handleInstall}
        >
          Install
        </button>
        <button
          type="button"
          className={styles.dismissButton}
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
        >
          Not now
        </button>
      </div>
    </div>
  );
};

// ── Update Banner ─────────────────────────────────────────────────────

export const UpdatePrompt = (): React.ReactElement | null => {
  const [updateState, setUpdateState] = useState<SwUpdateState>({
    updateAvailable: false,
    applying: false,
  });

  useEffect(() => {
    return onSwUpdate(setUpdateState);
  }, []);

  if (!updateState.updateAvailable) {
    return null;
  }

  return (
    <div
      className={styles.banner}
      role="status"
      aria-live="polite"
      aria-label="App update"
    >
      <p className={styles.text}>A new version of SPC Player is available</p>
      <button
        type="button"
        className={styles.installButton}
        onClick={applySwUpdate}
        disabled={updateState.applying}
      >
        {updateState.applying ? 'Updating…' : 'Update'}
      </button>
    </div>
  );
};
