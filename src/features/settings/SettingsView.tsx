import { Separator } from '@/components/Separator/Separator';
import { ThemeSettings } from './ThemeSettings';
import { AudioQualitySettings } from './AudioQualitySettings';
import { SeekPerformanceSettings } from './SeekPerformanceSettings';
import { PlaybackSettings } from './PlaybackSettings';
import { KeyboardShortcutSettings } from './KeyboardShortcutSettings';
import { ExportDefaultSettings } from './ExportDefaultSettings';
import { AboutSection } from './AboutSection';
import styles from './SettingsView.module.css';

// ── Component ─────────────────────────────────────────────────────────

export function SettingsView() {
  return (
    <main aria-label="Settings" className={styles.container}>
      <h1 className={styles.visuallyHidden}>Settings</h1>

      <section className={styles.section}>
        <h2 className={styles.heading}>Theme</h2>
        <ThemeSettings />
      </section>

      <Separator />

      <section className={styles.section}>
        <h2 className={styles.heading}>Audio Quality</h2>
        <AudioQualitySettings />
      </section>

      <Separator />

      <section className={styles.section}>
        <h2 className={styles.heading}>Seek Performance</h2>
        <SeekPerformanceSettings />
      </section>

      <Separator />

      <section className={styles.section}>
        <h2 className={styles.heading}>Playback Defaults</h2>
        <PlaybackSettings />
      </section>

      <Separator />

      <section className={styles.section}>
        <h2 className={styles.heading}>Keyboard Shortcuts</h2>
        <KeyboardShortcutSettings />
      </section>

      <Separator />

      <section className={styles.section}>
        <h2 className={styles.heading}>Export Defaults</h2>
        <ExportDefaultSettings />
      </section>

      <Separator />

      <section className={styles.section}>
        <h2 className={styles.heading}>About</h2>
        <AboutSection />
      </section>
    </main>
  );
}
