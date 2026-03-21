import type { ReactNode } from 'react';

import * as Dialog from '@/components/Dialog/Dialog';
import { defaultKeymap } from '@/shortcuts/default-keymap';
import { isMacPlatform } from '@/utils/platform';

import type { ShortcutActionId } from '@/shortcuts/types';

import styles from './ShortcutHelpDialog.module.css';

const IS_MAC = isMacPlatform();

const KEY_DISPLAY: Record<string, [mac: string, other: string]> = {
  Ctrl: ['⌘', 'Ctrl'],
  Shift: ['⇧', 'Shift'],
  Alt: ['⌥', 'Alt'],
  ArrowUp: ['↑', '↑'],
  ArrowDown: ['↓', '↓'],
  ArrowLeft: ['←', '←'],
  ArrowRight: ['→', '→'],
  Space: ['Space', 'Space'],
  Backspace: ['⌫', 'Backspace'],
  Delete: ['⌦', 'Delete'],
  Escape: ['Esc', 'Esc'],
  Enter: ['↵', 'Enter'],
  BracketLeft: ['[', '['],
  BracketRight: [']', ']'],
  Backquote: ['`', '`'],
  Slash: ['/', '/'],
};

function formatKeyPart(part: string): string {
  const entry = KEY_DISPLAY[part];
  if (entry) return IS_MAC ? entry[0] : entry[1];

  // Strip 'Key' prefix for letter keys and 'Digit' for number keys
  if (part.startsWith('Key')) return part.slice(3);
  if (part.startsWith('Digit')) return part.slice(5);

  return part;
}

function formatCombo(combo: string): string {
  const glue = IS_MAC ? '' : '+';
  return combo.split('+').map(formatKeyPart).join(glue);
}

interface ShortcutEntry {
  label: string;
  actionId: ShortcutActionId;
}

interface ShortcutCategory {
  title: string;
  entries: ShortcutEntry[];
}

const CATEGORIES: ShortcutCategory[] = [
  {
    title: 'Player',
    entries: [
      { label: 'Play / Pause', actionId: 'playback.playPause' },
      { label: 'Stop', actionId: 'playback.stop' },
      { label: 'Next track', actionId: 'playback.nextTrack' },
      { label: 'Previous track', actionId: 'playback.previousTrack' },
      { label: 'Seek forward', actionId: 'playback.seekForward' },
      { label: 'Seek backward', actionId: 'playback.seekBackward' },
      { label: 'Volume up', actionId: 'playback.volumeUp' },
      { label: 'Volume down', actionId: 'playback.volumeDown' },
      { label: 'Mute', actionId: 'playback.mute' },
      { label: 'Speed up', actionId: 'playback.speedIncrease' },
      { label: 'Speed down', actionId: 'playback.speedDecrease' },
      { label: 'Speed reset', actionId: 'playback.speedReset' },
      { label: 'Toggle repeat', actionId: 'playback.toggleRepeat' },
      { label: 'Toggle shuffle', actionId: 'playback.toggleShuffle' },
    ],
  },
  {
    title: 'Navigation',
    entries: [
      { label: 'Player view', actionId: 'navigation.player' },
      { label: 'Playlist view', actionId: 'navigation.playlist' },
      { label: 'Instrument view', actionId: 'navigation.instrument' },
      { label: 'Analysis view', actionId: 'navigation.analysis' },
      { label: 'Settings view', actionId: 'navigation.settings' },
      { label: 'Search', actionId: 'navigation.search' },
      { label: 'This help', actionId: 'navigation.showHelp' },
    ],
  },
  {
    title: 'Playlist',
    entries: [
      { label: 'Add files', actionId: 'playlist.addFiles' },
      { label: 'Remove track', actionId: 'playlist.removeTrack' },
      { label: 'Move up', actionId: 'playlist.moveUp' },
      { label: 'Move down', actionId: 'playlist.moveDown' },
      { label: 'Select all', actionId: 'playlist.selectAll' },
      { label: 'Deselect all', actionId: 'playlist.deselectAll' },
      { label: 'Play selected', actionId: 'playlist.playSelected' },
    ],
  },
  {
    title: 'Mixer',
    entries: [
      { label: 'Toggle voice 1–8', actionId: 'mixer.toggleVoice1' },
      { label: 'Solo voice 1–8', actionId: 'mixer.soloVoice1' },
      { label: 'Unmute all', actionId: 'mixer.unmuteAll' },
    ],
  },
  {
    title: 'A-B Loop',
    entries: [
      { label: 'Set loop start', actionId: 'loop.setStart' },
      { label: 'Set loop end', actionId: 'loop.setEnd' },
      { label: 'Toggle loop', actionId: 'loop.toggle' },
      { label: 'Clear loop', actionId: 'loop.clear' },
    ],
  },
  {
    title: 'Export',
    entries: [
      { label: 'Open export', actionId: 'export.openDialog' },
      { label: 'Quick export', actionId: 'export.quickExport' },
    ],
  },
  {
    title: 'General',
    entries: [
      { label: 'Open file', actionId: 'general.openFile' },
      { label: 'Undo', actionId: 'general.undo' },
      { label: 'Redo', actionId: 'general.redo' },
      { label: 'Fullscreen', actionId: 'general.toggleFullscreen' },
      { label: 'Close / Exit', actionId: 'general.closeDialog' },
      { label: 'Instrument mode', actionId: 'general.toggleInstrumentMode' },
    ],
  },
];

function KeyCombo({ combo }: { combo: string }): ReactNode {
  const parts = formatCombo(combo).split(IS_MAC ? '' : '+');
  return (
    <span className={styles.keys}>
      {parts.map((part, i) => (
        <kbd key={i} className={styles.kbd}>
          {part}
        </kbd>
      ))}
    </span>
  );
}

function CategorySection({
  category,
}: {
  category: ShortcutCategory;
}): ReactNode {
  return (
    <div className={styles.category}>
      <h3 className={styles.categoryTitle}>{category.title}</h3>
      {category.entries.map((entry) => {
        const binding = defaultKeymap.get(entry.actionId);
        if (!binding) return null;
        const primaryKey = binding.keys[0];
        if (!primaryKey) return null;
        return (
          <div key={entry.actionId} className={styles.row}>
            <span className={styles.label}>{entry.label}</span>
            <KeyCombo combo={primaryKey} />
          </div>
        );
      })}
    </div>
  );
}

export interface ShortcutHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutHelpDialog({
  open,
  onOpenChange,
}: ShortcutHelpDialogProps): ReactNode {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className={styles.dialogContent}>
        <Dialog.Title>Keyboard Shortcuts</Dialog.Title>
        <Dialog.Description>
          All available keyboard shortcuts. Edit in Settings.
        </Dialog.Description>
        <div className={styles.grid}>
          {CATEGORIES.map((cat) => (
            <CategorySection key={cat.title} category={cat} />
          ))}
        </div>
        <p className={styles.footer}>Press Escape to close.</p>
        <Dialog.Close aria-label="Close" />
      </Dialog.Content>
    </Dialog.Root>
  );
}
