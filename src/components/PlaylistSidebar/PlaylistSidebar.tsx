import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { useAppStore } from '@/store/store';
import { PlaylistTrackList } from '@/components/PlaylistTrackList/PlaylistTrackList';

import styles from './PlaylistSidebar.module.css';

const REPEAT_LABELS: Record<string, string> = {
  off: 'Repeat: off',
  all: 'Repeat all',
  one: 'Repeat one',
};

const REPEAT_CYCLE: Record<string, 'off' | 'all' | 'one'> = {
  off: 'all',
  all: 'one',
  one: 'off',
};

const SIDEBAR_COLLAPSED_KEY = 'spc-sidebar-collapsed';

function readCollapsedState(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsedState(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // localStorage unavailable — ignore
  }
}

/**
 * Playlist sidebar for desktop/tablet. Hidden on mobile via CSS.
 * Wraps PlaylistTrackList with add-files, shuffle/repeat controls,
 * and a collapsible toggle on tablet breakpoints.
 */
export function PlaylistSidebar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // ── Store selectors ───────────────────────────────────────────────
  const tracks = useAppStore((s) => s.tracks);
  const shuffleMode = useAppStore((s) => s.shuffleMode);
  const repeatMode = useAppStore((s) => s.repeatMode);
  const loadFile = useAppStore((s) => s.loadFile);
  const setShuffleMode = useAppStore((s) => s.setShuffleMode);
  const setRepeatMode = useAppStore((s) => s.setRepeatMode);

  // ── Collapse state (tablet only) ──────────────────────────────────
  const [isCollapsed, setIsCollapsed] = useState(readCollapsedState);

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      writeCollapsedState(next);
      return next;
    });
  }, []);

  // Move focus to toggle button when sidebar collapses with focus inside
  useEffect(() => {
    if (isCollapsed && sidebarRef.current) {
      const activeEl = document.activeElement;
      if (activeEl && sidebarRef.current.contains(activeEl)) {
        toggleRef.current?.focus();
      }
    }
  }, [isCollapsed]);

  // ── File handling ─────────────────────────────────────────────────
  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (const file of Array.from(files)) {
        loadFile(file);
      }
      e.target.value = '';
    },
    [loadFile],
  );

  const handleAddClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ── Shuffle / Repeat ──────────────────────────────────────────────
  const handleShuffleToggle = useCallback(() => {
    setShuffleMode(!useAppStore.getState().shuffleMode);
  }, [setShuffleMode]);

  const handleRepeatCycle = useCallback(() => {
    setRepeatMode(REPEAT_CYCLE[repeatMode]);
  }, [repeatMode, setRepeatMode]);

  const isEmpty = tracks.length === 0;

  return (
    <>
      {/* Tablet collapse toggle — positioned outside sidebar content */}
      <button
        ref={toggleRef}
        type="button"
        className={styles.collapseToggle}
        aria-expanded={!isCollapsed}
        aria-controls={isCollapsed ? undefined : 'playlist-sidebar'}
        aria-label="Toggle playlist sidebar"
        onClick={handleToggleCollapse}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
        </svg>
      </button>

      {/* Sidebar content — hidden when collapsed via display:none for a11y */}
      {!isCollapsed && (
        <div ref={sidebarRef} id="playlist-sidebar" className={styles.sidebar}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".spc"
            multiple
            className="visually-hidden"
            onChange={handleFileChange}
            tabIndex={-1}
            aria-label="Select SPC files to add"
          />

          {/* Header */}
          <div className={styles.header}>
            <span className={styles.title}>Playlist</span>
            <button
              type="button"
              className={styles.addButton}
              onClick={handleAddClick}
            >
              + Add Files
            </button>
          </div>

          <div className={styles.divider} />

          {/* Track list or empty state */}
          {isEmpty ? (
            <div className={styles.emptyState} role="status">
              <span className={styles.emptyTitle}>No tracks added yet.</span>
              <span className={styles.emptyHint}>
                Drop files or click above.
              </span>
            </div>
          ) : (
            <div className={styles.trackListArea}>
              <PlaylistTrackList compact />
            </div>
          )}

          {/* Footer — shuffle & repeat */}
          {!isEmpty && (
            <>
              <div className={styles.divider} />
              <div className={styles.footer}>
                <button
                  type="button"
                  className={`${styles.footerButton}${shuffleMode ? ` ${styles.footerButtonActive}` : ''}`}
                  aria-pressed={shuffleMode}
                  onClick={handleShuffleToggle}
                >
                  Shuffle
                </button>
                <div className={styles.footerSpacer} />
                <button
                  type="button"
                  className={`${styles.footerButton}${repeatMode !== 'off' ? ` ${styles.footerButtonActive}` : ''}`}
                  aria-label={REPEAT_LABELS[repeatMode]}
                  onClick={handleRepeatCycle}
                >
                  {REPEAT_LABELS[repeatMode]}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
