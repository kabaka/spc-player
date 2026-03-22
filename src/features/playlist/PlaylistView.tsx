import type { ChangeEvent, DragEvent } from 'react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/Button/Button';
import { PlaylistTrackList } from '@/components/PlaylistTrackList/PlaylistTrackList';
import { useShortcut } from '@/shortcuts/useShortcut';
import { useAppStore } from '@/store/store';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const announcerRef = useRef<HTMLDivElement>(null);

  // ── Store selectors ───────────────────────────────────────────────
  const tracks = useAppStore((s) => s.tracks);
  const shuffleMode = useAppStore((s) => s.shuffleMode);
  const repeatMode = useAppStore((s) => s.repeatMode);
  const loadFile = useAppStore((s) => s.loadFile);
  const removeTrack = useAppStore((s) => s.removeTrack);
  const reorderTracks = useAppStore((s) => s.reorderTracks);
  const setShuffleMode = useAppStore((s) => s.setShuffleMode);
  const setRepeatMode = useAppStore((s) => s.setRepeatMode);
  const playTrackAtIndex = useAppStore((s) => s.playTrackAtIndex);

  // ── Local state ───────────────────────────────────────────────────
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);

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

  // ── Shuffle / Repeat ──────────────────────────────────────────────
  const handleShuffleToggle = useCallback(() => {
    setShuffleMode(!useAppStore.getState().shuffleMode);
  }, [setShuffleMode]);

  const handleRepeatCycle = useCallback(() => {
    setRepeatMode(REPEAT_CYCLE[repeatMode]);
  }, [repeatMode, setRepeatMode]);

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

        {/* Track list — shared component */}
        {tracks.length === 0 ? (
          <p role="status" className={styles.emptyState}>
            No tracks in playlist. Drop SPC files here or use the file picker to
            add tracks.
          </p>
        ) : (
          <PlaylistTrackList />
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
