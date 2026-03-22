import type { KeyboardEvent, MouseEvent } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useAppStore } from '@/store/store';
import type { PlaylistTrack } from '@/store/types';
import { formatSpokenTime, formatTime } from '@/utils/format-time';

import styles from './PlaylistTrackList.module.css';

export interface PlaylistTrackListProps {
  /** Compact 36px rows for sidebar use */
  compact?: boolean;
}

/**
 * Shared track list rendering used by both PlaylistSidebar (desktop/tablet)
 * and PlaylistView (mobile). Renders an ARIA listbox with keyboard navigation.
 */
export function PlaylistTrackList({ compact = false }: PlaylistTrackListProps) {
  const idPrefix = useId();
  const listboxRef = useRef<HTMLDivElement>(null);
  const announcerRef = useRef<HTMLDivElement>(null);

  // ── Store selectors ───────────────────────────────────────────────
  const tracks = useAppStore((s) => s.tracks);
  const activeIndex = useAppStore((s) => s.activeIndex);
  const playTrackAtIndex = useAppStore((s) => s.playTrackAtIndex);

  // ── Local state ───────────────────────────────────────────────────
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastShiftAnchor = useRef<number | null>(null);

  // ── Type-ahead search ─────────────────────────────────────────────
  const typeAheadBuffer = useRef('');
  const typeAheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const TYPE_AHEAD_TIMEOUT_MS = 500;

  const clearTypeAheadBuffer = useCallback(() => {
    typeAheadBuffer.current = '';
    typeAheadTimer.current = null;
  }, []);

  const handleTypeAhead = useCallback(
    (char: string) => {
      if (typeAheadTimer.current !== null) {
        clearTimeout(typeAheadTimer.current);
      }
      typeAheadBuffer.current += char.toLowerCase();
      typeAheadTimer.current = setTimeout(
        clearTypeAheadBuffer,
        TYPE_AHEAD_TIMEOUT_MS,
      );

      const query = typeAheadBuffer.current;
      const matchIndex = tracks.findIndex((t) =>
        t.title.toLowerCase().startsWith(query),
      );
      if (matchIndex !== -1) {
        setFocusedIndex(matchIndex);
      }
    },
    [tracks, clearTypeAheadBuffer],
  );

  // ── Derived ───────────────────────────────────────────────────────
  const trackId = (index: number) => `${idPrefix}track-${index}`;
  const focusedId = tracks.length > 0 ? trackId(focusedIndex) : undefined;

  // Clamp focused index when tracks change
  useEffect(() => {
    if (tracks.length > 0 && focusedIndex >= tracks.length) {
      setFocusedIndex(Math.max(0, tracks.length - 1));
    }
  }, [tracks.length, focusedIndex]);

  // Scroll focused track into view
  useEffect(() => {
    if (focusedIndex >= 0 && tracks.length > 0) {
      const el = document.getElementById(`${idPrefix}track-${focusedIndex}`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, tracks.length, idPrefix]);

  // ── Announcements ─────────────────────────────────────────────────
  const announce = useCallback((message: string) => {
    if (announcerRef.current) {
      announcerRef.current.textContent = message;
    }
  }, []);

  // ── Selection helpers ─────────────────────────────────────────────
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectRange = useCallback(
    (from: number, to: number) => {
      const start = Math.min(from, to);
      const end = Math.max(from, to);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          const t = tracks[i];
          if (t) next.add(t.id);
        }
        return next;
      });
    },
    [tracks],
  );

  // ── Track click ───────────────────────────────────────────────────
  const handleTrackClick = useCallback(
    (e: MouseEvent, index: number) => {
      const track = tracks[index];
      if (!track) return;

      if (e.metaKey || e.ctrlKey) {
        toggleSelection(track.id);
        lastShiftAnchor.current = index;
      } else if (e.shiftKey) {
        const anchor = lastShiftAnchor.current ?? focusedIndex;
        selectRange(anchor, index);
      } else {
        setSelectedIds(new Set([track.id]));
        lastShiftAnchor.current = index;
      }
      setFocusedIndex(index);
    },
    [tracks, toggleSelection, selectRange, focusedIndex],
  );

  // ── Double-click to play ──────────────────────────────────────────
  const handleTrackDoubleClick = useCallback(
    (index: number) => {
      playTrackAtIndex(index);
    },
    [playTrackAtIndex],
  );

  // ── Keyboard navigation (ARIA listbox pattern) ────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (tracks.length === 0) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const next = Math.min(focusedIndex + 1, tracks.length - 1);
          setFocusedIndex(next);
          if (e.shiftKey) {
            const anchor = lastShiftAnchor.current ?? focusedIndex;
            selectRange(anchor, next);
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prev = Math.max(focusedIndex - 1, 0);
          setFocusedIndex(prev);
          if (e.shiftKey) {
            const anchor = lastShiftAnchor.current ?? focusedIndex;
            selectRange(anchor, prev);
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          setFocusedIndex(0);
          break;
        }
        case 'End': {
          e.preventDefault();
          setFocusedIndex(tracks.length - 1);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          playTrackAtIndex(focusedIndex);
          announce(
            `Playing ${tracks[focusedIndex]?.title ?? `track ${focusedIndex + 1}`}`,
          );
          break;
        }
        case ' ': {
          e.preventDefault();
          const track = tracks[focusedIndex];
          if (track) {
            toggleSelection(track.id);
            lastShiftAnchor.current = focusedIndex;
          }
          break;
        }
        default:
          // Type-ahead: alphanumeric characters trigger search
          if (e.key.length === 1 && /^[a-z0-9]$/i.test(e.key)) {
            e.preventDefault();
            handleTypeAhead(e.key);
          }
          break;
      }
    },
    [
      tracks,
      focusedIndex,
      selectRange,
      toggleSelection,
      playTrackAtIndex,
      announce,
      handleTypeAhead,
    ],
  );

  // ── Track aria-label builder ──────────────────────────────────────
  const buildTrackLabel = (track: PlaylistTrack, index: number): string => {
    const parts = [
      `Track ${index + 1}: ${track.title}`,
      formatSpokenTime(track.durationMs / 1000),
    ].filter(Boolean);

    let label = parts.join(', ');
    if (index === activeIndex) {
      label += '. Now playing.';
    }
    return label;
  };

  const containerClass = compact ? undefined : styles.standard;

  if (tracks.length === 0) {
    return null;
  }

  return (
    <div className={containerClass}>
      <div
        ref={listboxRef}
        role="listbox"
        aria-label="Playlist tracks"
        aria-multiselectable="true"
        aria-activedescendant={focusedId}
        tabIndex={0}
        className={styles.listbox}
        onKeyDown={handleKeyDown}
      >
        {tracks.map((track, index) => {
          const isSelected = selectedIds.has(track.id);
          const isFocused = index === focusedIndex;
          const isPlaying = index === activeIndex;

          const rowClass = [
            styles.trackRow,
            isFocused && styles.trackRowFocused,
            isSelected && styles.trackRowSelected,
            isPlaying && styles.trackRowActive,
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              key={track.id}
              role="option"
              id={trackId(index)}
              aria-selected={isSelected}
              aria-current={isPlaying ? 'true' : undefined}
              aria-label={buildTrackLabel(track, index)}
              className={rowClass}
              onClick={(e) => handleTrackClick(e, index)}
              onDoubleClick={() => handleTrackDoubleClick(index)}
            >
              {isPlaying ? (
                <span className={styles.playIcon} aria-hidden="true">
                  ▶
                </span>
              ) : (
                <span className={styles.trackNumber} aria-hidden="true">
                  {index + 1}
                </span>
              )}
              <span className={styles.trackTitle}>{track.title}</span>
              <span className={styles.trackDuration}>
                {formatTime(track.durationMs / 1000)}
              </span>
            </div>
          );
        })}
      </div>
      <div
        ref={announcerRef}
        aria-live="polite"
        aria-atomic="true"
        className="visually-hidden"
      />
    </div>
  );
}
