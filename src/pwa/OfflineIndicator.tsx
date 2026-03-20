import { useState, useEffect } from 'react';

import styles from './OfflineIndicator.module.css';

export const OfflineIndicator = (): React.ReactElement | null => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = (): void => setIsOffline(true);
    const goOnline = (): void => setIsOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <div
      className={styles.indicator}
      role="status"
      aria-live="polite"
      aria-label="Network status"
    >
      <svg
        className={styles.icon}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        width="14"
        height="14"
      >
        <path
          d="M1 1L15 15M3.5 6.5C4.8 5.4 6.3 4.8 8 4.8c1.1 0 2.2.3 3.1.7M5.5 9.2c.7-.6 1.6-.9 2.5-.9.9 0 1.8.3 2.5.9M8 12.5a1 1 0 100-2 1 1 0 000 2z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={styles.text}>Offline</span>
    </div>
  );
};
