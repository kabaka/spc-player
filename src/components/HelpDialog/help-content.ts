import type { ShortcutActionId } from '@/shortcuts/types';

// ── Tab identifiers ──────────────────────────────────────────────────

export type HelpTabId =
  | 'getting-started'
  | 'playback'
  | 'shortcuts'
  | 'playlist'
  | 'mixer'
  | 'export'
  | 'instrument'
  | 'analysis'
  | 'settings'
  | 'troubleshooting'
  | 'about';

export interface HelpTab {
  id: HelpTabId;
  label: string;
}

export const HELP_TABS: readonly HelpTab[] = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'playback', label: 'Playback' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'playlist', label: 'Playlist' },
  { id: 'mixer', label: 'Mixer' },
  { id: 'export', label: 'Export' },
  { id: 'instrument', label: 'Instrument' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'settings', label: 'Settings' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
  { id: 'about', label: 'About' },
] as const;

// ── Shortcut categories (for Keyboard Shortcuts tab) ─────────────────

export interface ShortcutEntry {
  label: string;
  actionId: ShortcutActionId;
}

export interface ShortcutCategory {
  title: string;
  entries: ShortcutEntry[];
}

export const SHORTCUT_CATEGORIES: readonly ShortcutCategory[] = [
  {
    title: 'Player',
    entries: [
      { label: 'Play / Pause', actionId: 'playback.playPause' },
      { label: 'Stop', actionId: 'playback.stop' },
      { label: 'Next track', actionId: 'playback.nextTrack' },
      { label: 'Previous track', actionId: 'playback.previousTrack' },
      { label: 'Seek forward (5s)', actionId: 'playback.seekForward' },
      { label: 'Seek backward (5s)', actionId: 'playback.seekBackward' },
      { label: 'Seek forward (30s)', actionId: 'playback.seekForwardLarge' },
      { label: 'Seek backward (30s)', actionId: 'playback.seekBackwardLarge' },
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
      { label: 'Help', actionId: 'navigation.showHelp' },
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
    title: 'A-B Loop',
    entries: [
      { label: 'Set loop start', actionId: 'loop.setStart' },
      { label: 'Set loop end', actionId: 'loop.setEnd' },
      { label: 'Toggle loop', actionId: 'loop.toggle' },
      { label: 'Clear loop', actionId: 'loop.clear' },
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
      { label: 'Close dialog', actionId: 'general.closeDialog' },
      { label: 'Instrument mode', actionId: 'general.toggleInstrumentMode' },
    ],
  },
] as const;

// ── Troubleshooting entries ──────────────────────────────────────────

export interface TroubleshootingEntry {
  problem: string;
  cause: string;
  solution: string;
}

export const TROUBLESHOOTING_ENTRIES: readonly TroubleshootingEntry[] = [
  {
    problem: 'No sound after pressing play',
    cause:
      'Browser autoplay policy blocks AudioContext until user interaction.',
    solution: 'Click anywhere on the page first, then press play.',
  },
  {
    problem: 'Seeking is slow',
    cause: 'SPC emulation replays from start to reach the seek position.',
    solution:
      'This is a known limitation. Checkpoint-based seeking is planned for a future release.',
  },
  {
    problem: 'Export fails for FLAC/Opus/MP3',
    cause:
      'The encoder may not be available in your browser, or the format is unsupported.',
    solution:
      'Try using WAV as a fallback — it works in all browsers. Check that your browser supports WebCodecs for Opus export.',
  },
  {
    problem: "MIDI keyboard doesn't work",
    cause:
      "Your browser may not support Web MIDI, or permission hasn't been granted.",
    solution:
      'Use Chrome or Edge (Web MIDI is not available in Firefox/Safari). Grant MIDI permission when prompted.',
  },
  {
    problem: "App doesn't work offline",
    cause: 'The service worker has not been installed yet.',
    solution:
      'Visit the app once while online. Subsequent visits will work offline.',
  },
  {
    problem: 'Speed change shifts pitch',
    cause: 'The current implementation links playback speed and pitch.',
    solution:
      'This is expected behavior. Pitch-independent speed control is planned (see ADR-0019).',
  },
] as const;

// ── Export format comparison ─────────────────────────────────────────

export interface ExportFormat {
  name: string;
  type: 'Lossless' | 'Lossless (compressed)' | 'Lossy';
  fileSize: string;
  browserSupport: string;
  notes: string;
}

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  {
    name: 'WAV',
    type: 'Lossless',
    fileSize: 'Large',
    browserSupport: 'All browsers',
    notes: 'Best compatibility. No quality loss.',
  },
  {
    name: 'FLAC',
    type: 'Lossless (compressed)',
    fileSize: 'Medium',
    browserSupport: 'All browsers',
    notes: 'Smaller than WAV with no quality loss.',
  },
  {
    name: 'Opus',
    type: 'Lossy',
    fileSize: 'Small',
    browserSupport: 'Chrome, Edge, Firefox',
    notes: 'Excellent quality at low bitrates. Uses WebCodecs API.',
  },
  {
    name: 'MP3',
    type: 'Lossy',
    fileSize: 'Small',
    browserSupport: 'All browsers',
    notes: 'Universal playback support. Moderate quality.',
  },
] as const;

// ── SNES audio glossary ──────────────────────────────────────────────

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const SNES_GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'SPC700',
    definition:
      'The 8-bit CPU in the SNES sound subsystem. It runs the music program independently from the main CPU.',
  },
  {
    term: 'S-DSP',
    definition:
      'The Sony Digital Signal Processor that generates audio. It has 8 voices, each capable of playing BRR-encoded samples.',
  },
  {
    term: 'BRR',
    definition:
      'Bit Rate Reduction — the SNES audio compression format. A lossy codec that compresses 16 samples into 9 bytes.',
  },
  {
    term: 'ADSR',
    definition:
      'Attack, Decay, Sustain, Release — the envelope generator that shapes how each voice fades in and out.',
  },
  {
    term: 'Echo Buffer',
    definition:
      'A region of SPC700 RAM used for the hardware echo/reverb effect. Configurable delay and feedback.',
  },
  {
    term: 'FIR Filter',
    definition:
      'An 8-tap Finite Impulse Response filter applied to the echo output. Shapes the echo tone.',
  },
  {
    term: 'Voice',
    definition:
      'One of 8 independent sound channels in the S-DSP. Each voice plays a BRR sample with its own pitch, volume, and envelope.',
  },
  {
    term: 'SPC File',
    definition:
      'A snapshot of the SPC700 memory state (64 KB RAM + DSP registers). Contains everything needed to play a SNES music track.',
  },
] as const;
