import { Tabs } from 'radix-ui';
import type { ReactNode } from 'react';

import * as Dialog from '@/components/Dialog/Dialog';
import { defaultKeymap } from '@/shortcuts/default-keymap';
import { isMacPlatform } from '@/utils/platform';

import type { ShortcutCategory } from './help-content';
import {
  EXPORT_FORMATS,
  HELP_TABS,
  SHORTCUT_CATEGORIES,
  SNES_GLOSSARY,
  TROUBLESHOOTING_ENTRIES,
} from './help-content';
import styles from './HelpDialog.module.css';

// ── Platform-aware key formatting ────────────────────────────────────

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
  if (part.startsWith('Key')) return part.slice(3);
  if (part.startsWith('Digit')) return part.slice(5);
  return part;
}

function formatCombo(combo: string): string {
  const glue = IS_MAC ? '' : '+';
  return combo.split('+').map(formatKeyPart).join(glue);
}

// ── Key combo display ────────────────────────────────────────────────

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

// ── Tab content components ───────────────────────────────────────────

function GettingStartedTab(): ReactNode {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Quick Start</h3>
        <ol className={styles.steps}>
          <li className={styles.step}>
            <div className={styles.stepContent}>
              <strong>Open SPC Player</strong> in your browser. It works
              entirely offline after first visit.
            </div>
          </li>
          <li className={styles.step}>
            <div className={styles.stepContent}>
              <strong>Load an SPC file</strong> — drag and drop onto the page,
              or click the open button.
            </div>
          </li>
          <li className={styles.step}>
            <div className={styles.stepContent}>
              <strong>Press Space</strong> to play. Use arrow keys to seek and
              adjust volume.
            </div>
          </li>
        </ol>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>What is an SPC file?</h3>
        <p className={styles.paragraph}>
          An SPC file is a snapshot of the SNES (Super Nintendo) audio hardware
          state. It contains the 64 KB of sound RAM, DSP register values, and
          the SPC700 processor state — everything needed to play back a music
          track from an SNES game.
        </p>
        <p className={styles.paragraph}>
          You can find SPC files at{' '}
          <a
            href="https://www.zophar.net/music/nintendo-snes-spc"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Zophar&apos;s Domain
          </a>
          , which hosts a large archive of SNES music rips.
        </p>
      </section>
    </>
  );
}

function PlaybackTab(): ReactNode {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Transport Controls</h3>
        <p className={styles.paragraph}>
          The transport bar at the bottom of the screen provides play/pause,
          stop, previous track, and next track buttons. The seek bar shows the
          current position and allows click-to-seek.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Seeking</h3>
        <ul className={styles.infoList}>
          <li>Arrow Left / Right — seek ±5 seconds</li>
          <li>Shift + Arrow Left / Right — seek ±30 seconds</li>
          <li>Home / End — jump to start / end (when available)</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Speed & Volume</h3>
        <p className={styles.paragraph}>
          Arrow Up / Down adjusts volume. Shift + Arrow Up / Down adjusts
          playback speed (0.25× to 4×). Press M to mute/unmute.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Loop Behavior</h3>
        <p className={styles.paragraph}>
          Many SPC tracks loop indefinitely. The player respects loop count and
          duration metadata from the SPC file&apos;s ID666 and xid6 tags when
          present. You can also set custom A-B loop regions with the [ and ]
          keys.
        </p>
      </section>
    </>
  );
}

function ShortcutCategorySection({
  category,
}: {
  category: ShortcutCategory;
}): ReactNode {
  return (
    <div className={styles.shortcutCategory}>
      <h4 className={styles.categoryTitle}>{category.title}</h4>
      {category.entries.map((entry) => {
        const binding = defaultKeymap.get(entry.actionId);
        if (!binding) return null;
        const primaryKey = binding.keys[0];
        if (!primaryKey) return null;
        return (
          <div key={entry.actionId} className={styles.shortcutRow}>
            <span className={styles.shortcutLabel}>{entry.label}</span>
            <KeyCombo combo={primaryKey} />
          </div>
        );
      })}
    </div>
  );
}

function ShortcutsTab(): ReactNode {
  return (
    <>
      <p className={styles.paragraph}>
        All keyboard shortcuts. Customize bindings in Settings.
      </p>
      <div className={styles.shortcutGrid}>
        {SHORTCUT_CATEGORIES.map((cat) => (
          <ShortcutCategorySection key={cat.title} category={cat} />
        ))}
      </div>
    </>
  );
}

function PlaylistTab(): ReactNode {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Adding Files</h3>
        <p className={styles.paragraph}>
          Drag and drop SPC files onto the app, or press Ctrl+O (⌘O on Mac) to
          open a file picker. You can add multiple files at once.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Managing the Playlist</h3>
        <ul className={styles.infoList}>
          <li>Click a track to select it. Hold Ctrl/⌘ for multi-select.</li>
          <li>
            Reorder tracks by dragging them, or use Alt+Up/Down with keyboard.
          </li>
          <li>Press Delete or Backspace to remove selected tracks.</li>
          <li>Double-click or press Enter to play a selected track.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Shuffle & Repeat</h3>
        <p className={styles.paragraph}>
          Press R to cycle through repeat modes (off, one, all). Press S to
          toggle shuffle mode. These affect the order of track advancement.
        </p>
      </section>
    </>
  );
}

function MixerTab(): ReactNode {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Voice Controls</h3>
        <p className={styles.paragraph}>
          The SNES has 8 independent sound channels (voices). Each voice plays a
          BRR-encoded sample with its own pitch, volume, and envelope. In the
          mixer, each voice has a mute button and VU meter.
        </p>
        <ul className={styles.infoList}>
          <li>Press 1–8 to toggle mute on voices 1–8.</li>
          <li>Press Shift+1–8 to solo a voice (mute all others).</li>
          <li>Press 0 to unmute all voices.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>What the 8 Voices Represent</h3>
        <p className={styles.paragraph}>
          Each SNES game assigns voices differently, but common assignments
          include:
        </p>
        <ul className={styles.infoList}>
          <li>Melody / lead instrument</li>
          <li>Bass line</li>
          <li>Drum / percussion channels</li>
          <li>Harmony / accompaniment</li>
          <li>Sound effects</li>
        </ul>
        <p className={styles.paragraph}>
          Muting and soloing voices lets you isolate individual parts to study
          the arrangement.
        </p>
      </section>
    </>
  );
}

function ExportTab(): ReactNode {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Format Comparison</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Format</th>
              <th>Type</th>
              <th>Size</th>
              <th>Support</th>
            </tr>
          </thead>
          <tbody>
            {EXPORT_FORMATS.map((fmt) => (
              <tr key={fmt.name}>
                <td>
                  <strong>{fmt.name}</strong>
                </td>
                <td>{fmt.type}</td>
                <td>{fmt.fileSize}</td>
                <td>{fmt.browserSupport}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Exporting</h3>
        <p className={styles.paragraph}>
          Press Ctrl+E (⌘E on Mac) to open the export dialog. Choose your output
          format, set the duration or loop count, and export. You can export
          individual tracks or batch export the entire playlist.
        </p>
        <p className={styles.paragraph}>
          Quick export (Ctrl+Shift+E / ⌘⇧E) exports with your last-used
          settings.
        </p>
      </section>
    </>
  );
}

function InstrumentTab(): ReactNode {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Keyboard Piano</h3>
        <p className={styles.paragraph}>
          In instrument mode, your computer keyboard becomes a piano. The layout
          follows the standard two-row pattern: the lower row (Z–M) plays white
          keys, and the upper row (S, D, G, H, J) plays black keys.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Octave & Velocity</h3>
        <ul className={styles.infoList}>
          <li>Use Z/X keys to shift the octave range up and down.</li>
          <li>Velocity (how hard the note plays) can be adjusted in the UI.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>MIDI Device Connection</h3>
        <p className={styles.paragraph}>
          Connect a MIDI keyboard or controller for a more natural playing
          experience. SPC Player uses the Web MIDI API and will prompt for
          permission on first use. MIDI is supported in Chrome and Edge.
        </p>
      </section>
    </>
  );
}

function AnalysisTab(): ReactNode {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Analysis Tabs</h3>
        <ul className={styles.infoList}>
          <li>
            <strong>Memory</strong> — View the 64 KB of SPC700 RAM as a hex
            dump. Useful for inspecting instrument data, sequences, and echo
            buffer contents.
          </li>
          <li>
            <strong>Registers</strong> — Live view of SPC700 CPU registers and
            S-DSP registers. Shows program counter, stack pointer, flags, and
            DSP state.
          </li>
          <li>
            <strong>Voices</strong> — Per-voice details: current pitch, volume,
            envelope phase, sample source, and ADSR settings for all 8 voices.
          </li>
          <li>
            <strong>Echo</strong> — Echo buffer configuration: delay, feedback,
            FIR filter coefficients, and the echo region in memory.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>SNES Audio Glossary</h3>
        <div className={styles.glossary}>
          {SNES_GLOSSARY.map((entry) => (
            <div key={entry.term}>
              <dt className={styles.glossaryTerm}>{entry.term}</dt>
              <dd className={styles.glossaryDef}>{entry.definition}</dd>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function SettingsTab(): ReactNode {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Theme</h3>
        <p className={styles.paragraph}>
          Switch between dark and light themes, or follow your system
          preference. Theme changes take effect immediately.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Audio Quality</h3>
        <p className={styles.paragraph}>
          Choose between quality presets that affect resampling and
          interpolation. Higher quality uses more CPU but produces cleaner
          audio.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Keyboard Remapping</h3>
        <p className={styles.paragraph}>
          Reassign any keyboard shortcut to a different key combination. Changes
          are saved and persist across sessions.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Default Timing</h3>
        <p className={styles.paragraph}>
          Set the default loop count and fade-out duration for tracks that
          don&apos;t have timing metadata in their ID666 or xid6 tags.
        </p>
      </section>
    </>
  );
}

function TroubleshootingTab(): ReactNode {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Problem</th>
          <th>Cause</th>
          <th>Solution</th>
        </tr>
      </thead>
      <tbody>
        {TROUBLESHOOTING_ENTRIES.map((entry) => (
          <tr key={entry.problem}>
            <td>
              <strong>{entry.problem}</strong>
            </td>
            <td>{entry.cause}</td>
            <td>{entry.solution}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AboutTab(): ReactNode {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>SPC Player</h3>
        <p className={styles.paragraph}>
          A browser-based player for SNES SPC music files. Built with
          WebAssembly, Web Audio, and Web MIDI.
        </p>
        <p className={styles.aboutMeta} data-testid="help-version">
          Version: {__APP_VERSION__}
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>License</h3>
        <p className={styles.paragraph}>
          SPC Player is open source under the MIT License.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Links</h3>
        <ul className={styles.infoList}>
          <li>
            <a
              href="https://github.com/kyleknighted/spc-player"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              GitHub Repository
            </a>
          </li>
          <li>
            <a
              href="https://github.com/kyleknighted/spc-player/blob/main/THIRD_PARTY_LICENSES"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              Third-Party Credits
            </a>
          </li>
        </ul>
      </section>
    </>
  );
}

// ── Tab content router ───────────────────────────────────────────────

const TAB_COMPONENTS: Record<string, () => ReactNode> = {
  'getting-started': GettingStartedTab,
  playback: PlaybackTab,
  shortcuts: ShortcutsTab,
  playlist: PlaylistTab,
  mixer: MixerTab,
  export: ExportTab,
  instrument: InstrumentTab,
  analysis: AnalysisTab,
  settings: SettingsTab,
  troubleshooting: TroubleshootingTab,
  about: AboutTab,
};

// ── Main component ───────────────────────────────────────────────────

export interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpDialog({ open, onOpenChange }: HelpDialogProps): ReactNode {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className={styles.dialogContent} aria-label="Help">
        <div className={styles.header}>
          <Dialog.Title className={styles.title}>Help</Dialog.Title>
          <Dialog.Description className={styles.description}>
            Learn how to use SPC Player.
          </Dialog.Description>
        </div>

        <Tabs.Root defaultValue="getting-started">
          <div className={styles.header}>
            <Tabs.List aria-label="Help sections" className={styles.tabList}>
              {HELP_TABS.map((tab) => (
                <Tabs.Trigger
                  key={tab.id}
                  value={tab.id}
                  className={styles.tabTrigger}
                >
                  {tab.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </div>

          {HELP_TABS.map((tab) => {
            const TabContent = TAB_COMPONENTS[tab.id];
            return (
              <Tabs.Content
                key={tab.id}
                value={tab.id}
                className={styles.tabContent}
              >
                {TabContent ? <TabContent /> : null}
              </Tabs.Content>
            );
          })}
        </Tabs.Root>

        <Dialog.Close aria-label="Close" />
      </Dialog.Content>
    </Dialog.Root>
  );
}
