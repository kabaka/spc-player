import { useCallback, useId } from 'react';

import { useAppStore } from '@/store/store';

import styles from './PrivacySettings.module.css';

export function PrivacySettings() {
  const checkboxId = useId();
  const externalFetchEnabled = useAppStore(
    (s) => s.coverArt.externalFetchEnabled,
  );
  const setCoverArtSettings = useAppStore((s) => s.setCoverArtSettings);

  const handleToggle = useCallback(() => {
    setCoverArtSettings({ externalFetchEnabled: !externalFetchEnabled });
  }, [externalFetchEnabled, setCoverArtSettings]);

  return (
    <div className={styles.container}>
      <label className={styles.toggleRow} htmlFor={checkboxId}>
        <input
          id={checkboxId}
          type="checkbox"
          checked={externalFetchEnabled}
          onChange={handleToggle}
          className={styles.checkbox}
        />
        <span className={styles.label}>
          Fetch cover art from RetroArch thumbnails
        </span>
      </label>
      <p className={styles.description}>
        When enabled, game titles are sent to GitHub (raw.githubusercontent.com)
        to fetch box art from the RetroArch thumbnails repository. Fetched
        images are cached locally for offline use.
      </p>
    </div>
  );
}
