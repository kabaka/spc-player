import styles from './AboutSection.module.css';

// ── Component ─────────────────────────────────────────────────────────

export function AboutSection() {
  return (
    <div className={styles.container}>
      <p className={styles.appName}>
        SPC Player <span className={styles.version}>v{__APP_VERSION__}</span>
      </p>
      <p className={styles.description}>
        A client-side PWA for playing, analyzing, and exporting SNES SPC music
        files.
      </p>
      <p className={styles.license}>MIT License</p>
    </div>
  );
}
