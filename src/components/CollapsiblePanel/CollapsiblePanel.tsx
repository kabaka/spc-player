import type { ReactNode } from 'react';

import styles from './CollapsiblePanel.module.css';

interface CollapsiblePanelProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsiblePanel({
  title,
  defaultOpen = false,
  children,
}: CollapsiblePanelProps) {
  return (
    <details className={styles.details} open={defaultOpen || undefined}>
      <summary className={styles.summary}>
        <svg
          className={styles.chevron}
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="currentColor"
        >
          <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
        </svg>
        {title}
      </summary>
      <div className={styles.content}>{children}</div>
    </details>
  );
}
