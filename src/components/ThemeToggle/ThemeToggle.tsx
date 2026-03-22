import { useCallback } from 'react';

import { useTheme } from '@/hooks/useTheme';

import styles from './ThemeToggle.module.css';

type ThemePreference = 'dark' | 'light' | 'system';

const CYCLE: readonly ThemePreference[] = ['dark', 'light', 'system'];

const THEME_META: Record<ThemePreference, { icon: string; label: string }> = {
  dark: { icon: '🌙', label: 'Dark' },
  light: { icon: '☀️', label: 'Light' },
  system: { icon: '💻', label: 'System' },
};

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  const cycle = useCallback(() => {
    const idx = CYCLE.indexOf(theme);
    setTheme(CYCLE[(idx + 1) % CYCLE.length]);
  }, [theme, setTheme]);

  const meta = THEME_META[theme];

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={cycle}
      aria-label={`Theme: ${theme}`}
    >
      <span className={styles.icon} aria-hidden="true">
        {meta.icon}
      </span>
      {meta.label}
    </button>
  );
};
