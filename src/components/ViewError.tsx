import { useEffect, useRef } from 'react';

import styles from './ViewError.module.css';

interface ViewErrorProps {
  readonly message: string;
  readonly onRetry?: () => void;
}

export const ViewError = ({ message, onRetry }: ViewErrorProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className={styles.error} role="alert">
      <h2 ref={headingRef} tabIndex={-1}>
        Something went wrong
      </h2>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  );
};
