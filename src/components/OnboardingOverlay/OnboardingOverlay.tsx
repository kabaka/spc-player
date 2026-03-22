import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import styles from './OnboardingOverlay.module.css';

const STORAGE_KEY = 'spc-player-onboarding-dismissed';

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Storage unavailable — overlay will show next visit, acceptable degradation
  }
}

export function OnboardingOverlay(): ReactNode {
  const [isVisible, setIsVisible] = useState(() => !isDismissed());
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  const dismiss = useCallback(() => {
    markDismissed();
    setIsVisible(false);
  }, []);

  // Capture previously focused element and auto-focus dismiss button on mount
  useEffect(() => {
    if (!isVisible) return;

    previousFocusRef.current = document.activeElement;
    dismissButtonRef.current?.focus();
  }, [isVisible]);

  // Restore focus on dismiss
  useEffect(() => {
    if (isVisible) return;

    const prev = previousFocusRef.current;
    if (prev instanceof HTMLElement) {
      prev.focus();
    }
  }, [isVisible]);

  // Dismiss on Escape key + focus trap
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismiss();
        return;
      }

      // Focus trap: keep Tab cycling within the dialog panel
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;

        const focusable = panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, dismiss]);

  // Dismiss when a file is loaded (listen for dragover → drop on document)
  useEffect(() => {
    if (!isVisible) return;

    const handleDrop = () => {
      dismiss();
    };

    document.addEventListener('drop', handleDrop);
    return () => document.removeEventListener('drop', handleDrop);
  }, [isVisible, dismiss]);

  if (!isVisible) return null;

  const handleBackdropKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      dismiss();
    }
  };

  return (
    <div
      className={styles.backdrop}
      onClick={dismiss}
      onKeyDown={handleBackdropKeyDown}
      role="presentation"
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- stopPropagation prevents backdrop dismiss when clicking inside dialog */}
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-label="Welcome to SPC Player"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.heading}>Welcome to SPC Player</h2>

        <ul className={styles.callouts}>
          <li className={styles.callout}>
            Drop SPC files here or click <strong>Open</strong> to load music.
          </li>
          <li className={styles.callout}>
            Use <kbd>Space</kbd> to play/pause, arrow keys to seek.
          </li>
          <li className={styles.callout}>
            Press <kbd>?</kbd> for all keyboard shortcuts and help.
          </li>
          <li className={styles.callout}>
            SPC Player works offline — install it from your browser&apos;s menu.
          </li>
        </ul>

        <button
          ref={dismissButtonRef}
          className={styles.dismissButton}
          onClick={dismiss}
        >
          Get Started
        </button>
      </div>
    </div>
  );
}
