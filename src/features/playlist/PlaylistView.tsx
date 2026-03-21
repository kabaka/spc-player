import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent, MouseEvent } from 'react';

import { useAppStore } from '@/store/store';
import { Button } from '@/components/Button/Button';
import * as ContextMenu from '@/components/ContextMenu/ContextMenu';
import { contextMenuStyles } from '@/components/ContextMenu/ContextMenu';
import { useShortcut } from '@/shortcuts/useShortcut';

import type { PlaylistTrack } from '@/store/types';
import { formatTime, formatSpokenTime } from '@/utils/format-time';

import styles from './PlaylistView.module.css';

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

// ── Component ─────────────────────────────────────────────────────────

export function PlaylistView() {
  const idPrefix = useId();
  const listboxRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const announcerRef = useRef<HTMLDivElement>(null);

  // ── Store selectors ───────────────────────────────────────────────
  const tracks = useAppStore((s) => s.tracks);
  const activeIndex = useAppStore((s) => s.activeIndex);
  const shuffleMode = useAppStore((s) => s.shuffleMode);
  const repeatMode = useAppStore((s) => s.repeatMode);
  const loadFile = useAppStore((s) => s.loadFile);
  const removeTrack = useAppStore((s) => s.removeTrack);
  const reorderTracks = useAppStore((s) => s.reorderTracks);
  const setShuffleMode = useAppStore((s) => s.setShuffleMode);
  const setRepeatMode = useAppStore((s) => s.setRepeatMode);
  const playTrackAtIndex = useAppStore((s) => s.playTrackAtIndex);

  // ── Refs ───────────────────────────────────────────────────────────
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  // ── Local state ───────────────────────────────────────────────────
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const lastShiftAnchor = useRef<number | null>(null);

  // ── Derived ───────────────────────────────────────────────────────
  const trackId = (index: number) => `${idPrefix}track-${index}`;
  const focusedId = tracks.length > 0 ? trackId(focusedIndex) : undefined;

  // Scroll focused track into view on arrow-key navigation
  useEffect(() => {
    if (focusedIndex >= 0 && tracks.length > 0) {
      const el = document.getElementById(`${idPrefix}track-${focusedIndex}`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, idPrefix, tracks.length]);

  // ── Announcements ─────────────────────────────────────────────────
  const announce = useCallback((message: string) => {
    if (announcerRef.current) {
      announcerRef.current.textContent = message;
    }
  }, []);

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

  // ── Remove selected ───────────────────────────────────────────────
  const handleRemoveSelected = useCallback(() => {
    if (selectedIds.size === 0) return;

    const removedNames: string[] = [];
    for (const id of selectedIds) {
      const track = tracks.find((t) => t.id === id);
      if (track) removedNames.push(track.title);
      removeTrack(id);
    }

    const remaining = tracks.length - selectedIds.size;
    setSelectedIds(new Set());

    if (removedNames.length === 1) {
      announce(
        `Removed ${removedNames[0]} from playlist. ${remaining} ${remaining === 1 ? 'track' : 'tracks'} remaining.`,
      );
    } else {
      announce(
        `Removed ${removedNames.length} tracks from playlist. ${remaining} ${remaining === 1 ? 'track' : 'tracks'} remaining.`,
      );
    }

    // Move focus after removal
    const nextFocus = Math.min(focusedIndex, remaining - 1);
    setFocusedIndex(Math.max(0, nextFocus));
  }, [selectedIds, tracks, removeTrack, announce, focusedIndex]);

  // ── Playlist shortcuts (via ShortcutManager scope system) ────────
  useShortcut('playlist.removeTrack', handleRemoveSelected, {
    scope: 'contextual',
  });

  useShortcut(
    'playlist.playSelected',
    () => {
      if (tracks.length === 0) return;
      playTrackAtIndex(focusedIndex);
    },
    { scope: 'contextual' },
  );

  useShortcut(
    'playlist.moveUp',
    () => {
      if (tracks.length === 0 || focusedIndex <= 0) return;
      reorderTracks(focusedIndex, focusedIndex - 1);
      const track = tracks[focusedIndex];
      const newIndex = focusedIndex - 1;
      setFocusedIndex(newIndex);
      if (track) {
        announce(
          `Moved ${track.title} to position ${newIndex + 1} of ${tracks.length}`,
        );
      }
    },
    { scope: 'contextual' },
  );

  useShortcut(
    'playlist.moveDown',
    () => {
      if (tracks.length === 0 || focusedIndex >= tracks.length - 1) return;
      reorderTracks(focusedIndex, focusedIndex + 1);
      const track = tracks[focusedIndex];
      const newIndex = focusedIndex + 1;
      setFocusedIndex(newIndex);
      if (track) {
        announce(
          `Moved ${track.title} to position ${newIndex + 1} of ${tracks.length}`,
        );
      }
    },
    { scope: 'contextual' },
  );

  useShortcut(
    'playlist.selectAll',
    () => {
      if (tracks.length === 0) return;
      setSelectedIds(new Set(tracks.map((t) => t.id)));
      announce(`${tracks.length} tracks selected`);
    },
    { scope: 'contextual' },
  );

  useShortcut(
    'playlist.deselectAll',
    () => {
      setSelectedIds(new Set());
      announce('All tracks deselected');
    },
    { scope: 'contextual' },
  );

  // ── Drag-and-drop (files) ─────────────────────────────────────────
  const handleContainerDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setIsDragOver(true);
    }
  }, []);

  const handleContainerDragLeave = useCallback((e: DragEvent) => {
    if (
      e.currentTarget === e.target ||
      !e.currentTarget.contains(e.relatedTarget as Node)
    ) {
      setIsDragOver(false);
    }
  }, []);

  const handleContainerDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.toLowerCase().endsWith('.spc'),
      );
      for (const file of files) {
        loadFile(file);
      }
    },
    [loadFile],
  );

  // ── Drag-and-drop (reorder) ───────────────────────────────────────
  const handleTrackDragStart = useCallback((e: DragEvent, index: number) => {
    setDragFromIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-spc-reorder', String(index));
  }, []);

  const handleTrackDragOver = useCallback(
    (e: DragEvent, index: number) => {
      if (dragFromIndex === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTargetIndex(index);
    },
    [dragFromIndex],
  );

  const handleTrackDrop = useCallback(
    (e: DragEvent, toIndex: number) => {
      e.preventDefault();
      if (dragFromIndex === null || dragFromIndex === toIndex) {
        setDragFromIndex(null);
        setDropTargetIndex(null);
        return;
      }
      const currentTracks = tracksRef.current;
      const track = currentTracks[dragFromIndex];
      reorderTracks(dragFromIndex, toIndex);
      if (track) {
        announce(
          `Moved ${track.title} to position ${toIndex + 1} of ${currentTracks.length}`,
        );
      }
      setDragFromIndex(null);
      setDropTargetIndex(null);
    },
    [dragFromIndex, reorderTracks, announce],
  );

  const handleTrackDragEnd = useCallback(() => {
    setDragFromIndex(null);
    setDropTargetIndex(null);
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

  // ── Listbox keyboard navigation (standard ARIA listbox keys) ─────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (tracks.length === 0) return;

      switch (e.key) {
        case 'ArrowDown': {
          if (e.altKey) break; // Handled by playlist.moveDown shortcut
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
          if (e.altKey) break; // Handled by playlist.moveUp shortcut
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
          break;
      }
    },
    [tracks, focusedIndex, selectRange, toggleSelection],
  );

  // ── Shuffle / Repeat ──────────────────────────────────────────────
  const handleShuffleToggle = useCallback(() => {
    setShuffleMode(!useAppStore.getState().shuffleMode);
  }, [setShuffleMode]);

  const handleRepeatCycle = useCallback(() => {
    setRepeatMode(REPEAT_CYCLE[repeatMode]);
  }, [repeatMode, setRepeatMode]);

  // ── Track aria-label builder ──────────────────────────────────────
  const buildTrackLabel = (track: PlaylistTrack, index: number): string => {
    const parts = [
      `Track ${index + 1}: ${track.title}`,
      track.filename !== track.title ? track.filename : null,
      formatSpokenTime(track.durationMs / 1000),
    ].filter(Boolean);

    let label = parts.join(', ');
    if (index === activeIndex) {
      label += '. Now playing.';
    }
    return label;
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      className={`${styles.dropZone}${isDragOver ? ` ${styles.dragOver}` : ''}`}
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={handleContainerDrop}
    >
      <div className={styles.container}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".spc"
          multiple
          className={styles.visuallyHidden}
          onChange={handleFileChange}
          tabIndex={-1}
          aria-label="Select SPC files to add"
        />

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <Button variant="secondary" size="sm" onClick={handleAddClick}>
            Add Files
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemoveSelected}
            disabled={selectedIds.size === 0}
          >
            Remove Selected
          </Button>
          <div className={styles.spacer} />
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={shuffleMode}
            onClick={handleShuffleToggle}
            className={shuffleMode ? styles.toggleActive : undefined}
          >
            Shuffle
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={REPEAT_LABELS[repeatMode]}
            onClick={handleRepeatCycle}
            className={repeatMode !== 'off' ? styles.toggleActive : undefined}
          >
            {REPEAT_LABELS[repeatMode]}
          </Button>
        </div>

        {/* Listbox */}
        {tracks.length === 0 ? (
          <p role="status" className={styles.emptyState}>
            No tracks in playlist. Drop SPC files here or use the file picker to
            add tracks.
          </p>
        ) : (
          <div
            ref={listboxRef}
            role="listbox"
            aria-label="Playlist"
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
                styles.track,
                isFocused && styles.focused,
                isSelected && styles.selected,
                isPlaying && styles.nowPlaying,
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <ContextMenu.Root key={track.id}>
                  <ContextMenu.Trigger asChild>
                    <div
                      role="option"
                      id={trackId(index)}
                      aria-selected={isSelected}
                      aria-current={isPlaying ? 'true' : undefined}
                      aria-label={buildTrackLabel(track, index)}
                      className={`${rowClass}${dropTargetIndex === index && dragFromIndex !== null ? ` ${styles.dropTarget}` : ''}`}
                      onClick={(e) => handleTrackClick(e, index)}
                      onDoubleClick={() => playTrackAtIndex(index)}
                      draggable="true"
                      onDragStart={(e) => handleTrackDragStart(e, index)}
                      onDragOver={(e) => handleTrackDragOver(e, index)}
                      onDrop={(e) => handleTrackDrop(e, index)}
                      onDragEnd={handleTrackDragEnd}
                    >
                      <span aria-hidden="true" className={styles.dragHandle}>
                        ⠿
                      </span>
                      <span className={styles.trackNumber}>{index + 1}</span>
                      <span className={styles.trackTitle}>{track.title}</span>
                      <span className={styles.trackDuration}>
                        {formatTime(track.durationMs / 1000)}
                      </span>
                    </div>
                  </ContextMenu.Trigger>
                  <ContextMenu.Content>
                    <ContextMenu.Item onSelect={() => playTrackAtIndex(index)}>
                      Play
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className={contextMenuStyles.destructive}
                      onSelect={() => removeTrack(track.id)}
                    >
                      Remove
                    </ContextMenu.Item>
                    <ContextMenu.Separator />
                    <ContextMenu.Item
                      disabled
                      title="Available in a future update"
                    >
                      Export…
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Root>
              );
            })}
          </div>
        )}
        <div
          ref={announcerRef}
          aria-live="polite"
          aria-atomic="true"
          className={styles.visuallyHidden}
        />
      </div>
    </div>
  );
}
