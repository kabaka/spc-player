import { Link } from '@tanstack/react-router';

import styles from './ToolsView.module.css';

// ── Tool links ────────────────────────────────────────────────────────

interface ToolLink {
  readonly to: string;
  readonly label: string;
  readonly description: string;
  readonly icon: React.ReactNode;
}

const TOOL_LINKS: readonly ToolLink[] = [
  {
    to: '/instrument',
    label: 'Instrument Mode',
    description: 'Play SPC instruments with MIDI',
    icon: (
      <svg viewBox="0 0 24 24" className={styles.linkIcon} aria-hidden="true">
        <path d="M15 2v2h-2V2h2zm-4 0v2H9v4H7V2h4zm6 4v4h-2V6h2zM7 10v4h2v-4h2v6H7v-2H5v-4h2zm8 0v6h-2v-6h2zm4 0v6h-2v-6h2zM5 18v4h2v-4h2v4h2v-4h2v4h2v-4h2v4h2v-4h2v4h2v2H3v-2h2v-4z" />
      </svg>
    ),
  },
  {
    to: '/analysis',
    label: 'Analysis',
    description: 'Memory, registers, and voice state',
    icon: (
      <svg viewBox="0 0 24 24" className={styles.linkIcon} aria-hidden="true">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
      </svg>
    ),
  },
];

// ── Component ─────────────────────────────────────────────────────────

export function ToolsView() {
  return (
    <main aria-label="Tools" className={styles.container}>
      <h1 className={styles.heading}>Tools</h1>
      <ul className={styles.list}>
        {TOOL_LINKS.map(({ to, label, description, icon }) => (
          <li key={to}>
            <Link to={to} className={styles.link}>
              {icon}
              <span>{label}</span>
              <span className={styles.linkDescription}>{description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
