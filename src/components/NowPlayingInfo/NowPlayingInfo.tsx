import { useAppStore } from '@/store/store';
import { formatSubtitle } from '@/utils/format-metadata';

import styles from './NowPlayingInfo.module.css';

type NowPlayingState = 'empty' | 'loading' | 'has-track';

function deriveState(
  isLoadingTrack: boolean,
  hasMetadata: boolean,
): NowPlayingState {
  if (isLoadingTrack) return 'loading';
  if (hasMetadata) return 'has-track';
  return 'empty';
}

export function NowPlayingInfo() {
  const isLoadingTrack = useAppStore((s) => s.isLoadingTrack);
  const metadata = useAppStore((s) => s.metadata);

  const state = deriveState(isLoadingTrack, metadata !== null);
  const title = metadata?.title || metadata?.gameTitle || 'Untitled';
  const subtitle = formatSubtitle(
    metadata?.gameTitle ?? '',
    metadata?.artist ?? '',
  );

  return (
    <div
      className={styles.container}
      aria-live="polite"
      aria-atomic="true"
      aria-busy={isLoadingTrack ? 'true' : undefined}
    >
      {/* EMPTY state */}
      <div
        className={styles.stateLayer}
        data-state={state === 'empty' ? 'visible' : 'hidden'}
        aria-hidden={state !== 'empty' ? 'true' : undefined}
      >
        <p className={styles.emptyText}>No track loaded</p>
        <p className={styles.emptySubtext}>
          Drop an SPC file or click Add Files
        </p>
      </div>

      {/* LOADING state */}
      <div
        className={styles.stateLayer}
        data-state={state === 'loading' ? 'visible' : 'hidden'}
        aria-hidden={state !== 'loading' ? 'true' : undefined}
      >
        <div
          className={`${styles.skeleton} ${styles.skeletonTitle}`}
          aria-hidden="true"
        />
        <div
          className={`${styles.skeleton} ${styles.skeletonSubtitle}`}
          aria-hidden="true"
        />
        <span className="visually-hidden">Loading track</span>
      </div>

      {/* HAS_TRACK state */}
      <div
        className={styles.stateLayer}
        data-state={state === 'has-track' ? 'visible' : 'hidden'}
        aria-hidden={state !== 'has-track' ? 'true' : undefined}
      >
        <p className={styles.title}>{title}</p>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
    </div>
  );
}
