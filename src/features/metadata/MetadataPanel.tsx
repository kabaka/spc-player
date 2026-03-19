import { useAppStore } from '@/store/store';

import type { SpcMetadata } from '@/core/spc-types';

import styles from './MetadataPanel.module.css';

// ── Helpers ───────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFade(ms: number): string {
  const seconds = ms / 1000;
  return `${seconds.toFixed(1)}s`;
}

// ── Sub-components ────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string | number | null | undefined;
}

function Field({ label, value }: FieldProps) {
  if (value === null || value === undefined || value === '') return null;

  return (
    <>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
    </>
  );
}

function MetadataFields({ metadata }: { metadata: SpcMetadata }) {
  const hasXid6 =
    metadata.ostTitle !== null ||
    metadata.ostDisc !== null ||
    metadata.ostTrack !== null ||
    metadata.publisher !== null ||
    metadata.copyrightYear !== null;

  return (
    <dl className={styles.list}>
      <Field label="Title" value={metadata.title} />
      <Field label="Game" value={metadata.gameTitle} />
      <Field label="Artist" value={metadata.artist} />
      <Field label="Dumper" value={metadata.dumperName} />
      <Field label="Comments" value={metadata.comments} />
      <Field label="Dump Date" value={metadata.dumpDate} />
      <Field
        label="Duration"
        value={formatDuration(metadata.songLengthSeconds)}
      />
      <Field label="Fade" value={formatFade(metadata.fadeLengthMs)} />
      <Field label="Emulator" value={metadata.emulatorUsed} />

      {hasXid6 && (
        <div className={styles.sectionLabel}>
          <dt className={styles.label}>Extended Tags</dt>
          <dd className={styles.value} aria-hidden="true">
            &nbsp;
          </dd>
        </div>
      )}
      <Field label="OST Title" value={metadata.ostTitle} />
      <Field
        label="Disc"
        value={metadata.ostDisc !== null ? String(metadata.ostDisc) : null}
      />
      <Field
        label="Track"
        value={metadata.ostTrack !== null ? String(metadata.ostTrack) : null}
      />
      <Field label="Publisher" value={metadata.publisher} />
      <Field
        label="Copyright"
        value={
          metadata.copyrightYear !== null
            ? String(metadata.copyrightYear)
            : null
        }
      />
    </dl>
  );
}

// ── Component ─────────────────────────────────────────────────────────

export function MetadataPanel() {
  const metadata = useAppStore((s) => s.metadata);

  if (!metadata) {
    return (
      <section className={styles.panel} aria-label="Track information">
        <p className={styles.empty}>No track loaded</p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="Track information">
      <h2 className={styles.heading}>Track Info</h2>
      <MetadataFields metadata={metadata} />
    </section>
  );
}
