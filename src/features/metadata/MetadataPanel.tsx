import type { ChangeEvent, ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';

import type { SpcMetadata } from '@/core/spc-types';
import { storeCoverArt } from '@/features/cover-art/cover-art-storage';
import { useAppStore } from '@/store/store';

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

function hasXid6Fields(metadata: SpcMetadata): boolean {
  return (
    metadata.ostTitle !== null ||
    metadata.ostDisc !== null ||
    metadata.ostTrack !== null ||
    metadata.publisher !== null ||
    metadata.copyrightYear !== null
  );
}

// ── Sub-components ────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
}

function Field({ label, value, mono }: FieldProps) {
  if (value === null || value === undefined || value === '') return null;

  return (
    <>
      <dt className={styles.label}>{label}</dt>
      <dd className={mono ? styles.valueMono : styles.value}>{value}</dd>
    </>
  );
}

// ── Section components ────────────────────────────────────────────────

function TrackInfoSection({
  metadata,
  trackPosition,
}: {
  metadata: SpcMetadata;
  trackPosition: string | null;
}) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Track Information</h2>
      <dl className={styles.list}>
        <Field label="Title" value={metadata.title} />
        <Field label="Game" value={metadata.gameTitle} />
        <Field label="Artist" value={metadata.artist} />
        <Field label="Dumper" value={metadata.dumperName} />
        <Field
          label="Duration"
          value={formatDuration(metadata.songLengthSeconds)}
          mono
        />
        <Field label="Fade" value={formatFade(metadata.fadeLengthMs)} mono />
        <Field label="Track" value={trackPosition} />
      </dl>
    </div>
  );
}

function TechnicalSection({ metadata }: { metadata: SpcMetadata }) {
  const formatValue =
    metadata.id666Format === 'text' ? 'SPC (ID666 text)' : 'SPC (ID666 binary)';

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionHeading}>Technical Details</h3>
      <dl className={styles.list}>
        <Field label="Format" value={formatValue} mono />
        <Field label="xid6" value={hasXid6Fields(metadata) ? 'Yes' : 'No'} />
        <Field label="Sample Rate" value="32000 Hz" mono />
        <Field label="Emulator" value={metadata.emulatorUsed} mono />
      </dl>
    </div>
  );
}

function ExtendedTagsSection({ metadata }: { metadata: SpcMetadata }) {
  if (!hasXid6Fields(metadata)) return null;

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionHeading}>Extended Tags</h3>
      <dl className={styles.list}>
        <Field label="OST Title" value={metadata.ostTitle} />
        <Field
          label="Disc"
          value={metadata.ostDisc !== null ? String(metadata.ostDisc) : null}
        />
        <Field
          label="Track #"
          value={metadata.ostTrack !== null ? String(metadata.ostTrack) : null}
        />
        <Field label="Publisher" value={metadata.publisher} />
        <Field
          label="Year"
          value={
            metadata.copyrightYear !== null
              ? String(metadata.copyrightYear)
              : null
          }
        />
        <Field label="Comment" value={metadata.comments} />
      </dl>
    </div>
  );
}

// ── Cover art upload ──────────────────────────────────────────────────

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

function CoverArtUpload({ gameTitle }: { gameTitle: string }): ReactNode {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>(
    'idle',
  );
  const setCoverArtSettings = useAppStore((s) => s.setCoverArtSettings);
  const coverArtVersion = useAppStore((s) => s.coverArt.version);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset input so the same file can be re-selected
      e.target.value = '';

      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setStatus('error');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setStatus('error');
        return;
      }

      setStatus('saving');
      try {
        const buffer = await file.arrayBuffer();
        await storeCoverArt(gameTitle, new Uint8Array(buffer), 'user');
        // Bump version to trigger CoverArtRenderer refresh
        setCoverArtSettings({ version: coverArtVersion + 1 });
        setStatus('done');
      } catch {
        setStatus('error');
      }
    },
    [gameTitle, setCoverArtSettings, coverArtVersion],
  );

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionHeading}>Cover Art</h3>
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        className="visually-hidden"
        onChange={handleFileChange}
        tabIndex={-1}
        aria-label="Select cover art image"
      />
      <button
        type="button"
        className={styles.coverArtButton}
        onClick={handleClick}
      >
        Set Cover Art
      </button>
      {status === 'done' && (
        <p className={styles.coverArtStatus} role="status">
          Cover art saved.
        </p>
      )}
      {status === 'error' && (
        <p className={styles.coverArtStatus} role="alert">
          Invalid file. Use PNG, JPEG, or WebP (max 2 MB).
        </p>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────

export function MetadataPanel() {
  const metadata = useAppStore((s) => s.metadata);
  const tracks = useAppStore((s) => s.tracks);
  const activeIndex = useAppStore((s) => s.activeIndex);

  if (!metadata) {
    return (
      <section className={styles.panel} aria-label="Track information">
        <p className={styles.empty}>No track loaded</p>
      </section>
    );
  }

  const trackPosition =
    tracks.length > 0 && activeIndex >= 0
      ? `${activeIndex + 1} of ${tracks.length}`
      : null;

  return (
    <section className={styles.panel} aria-label="Track information">
      <TrackInfoSection metadata={metadata} trackPosition={trackPosition} />
      <TechnicalSection metadata={metadata} />
      <ExtendedTagsSection metadata={metadata} />
      {metadata.gameTitle && <CoverArtUpload gameTitle={metadata.gameTitle} />}
    </section>
  );
}
