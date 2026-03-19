import { useCallback, useEffect, useState } from 'react';

import styles from './ThemeToggle.module.css';

type ThemePreference = 'dark' | 'light' | 'system';

const THEME_KEY = 'spc-theme';

const CYCLE: readonly ThemePreference[] = ['dark', 'light', 'system'];

const THEME_META: Record<ThemePreference, { icon: string; label: string }> = {
  dark: { icon: '🌙', label: 'Dark' },
  light: { icon: '☀️', label: 'Light' },
  system: { icon: '💻', label: 'System' },
};

const getStoredTheme = (): ThemePreference => {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return 'system';
};

const applyTheme = (preference: ThemePreference): void => {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');

  if (preference === 'system') {
    localStorage.removeItem(THEME_KEY);
    const preferLight = window.matchMedia(
      '(prefers-color-scheme: light)',
    ).matches;
    root.classList.add(preferLight ? 'light' : 'dark');
  } else {
    localStorage.setItem(THEME_KEY, preference);
    root.classList.add(preference);
  }
};

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<ThemePreference>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((current) => {
      const idx = CYCLE.indexOf(current);
      return CYCLE[(idx + 1) % CYCLE.length];
    });
  }, []);

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
