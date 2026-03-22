import type { ChangeEvent } from 'react';
import { useCallback, useId, useSyncExternalStore } from 'react';

import { useAppStore } from '@/store/store';
import type { SettingsSlice } from '@/store/types';

import styles from './ThemeSettings.module.css';

type ThemeOption = SettingsSlice['theme'];

const THEME_OPTIONS: readonly { value: ThemeOption; label: string }[] = [
  { value: 'dark', label: '🌙 Dark' },
  { value: 'light', label: '☀️ Light' },
  { value: 'system', label: '💻 System' },
];

const darkMq =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : undefined;

function subscribeToColorScheme(cb: () => void) {
  darkMq?.addEventListener('change', cb);
  return () => darkMq?.removeEventListener('change', cb);
}

function getSystemTheme(): 'dark' | 'light' {
  return darkMq?.matches ? 'dark' : 'light';
}

export function ThemeSettings() {
  const groupId = useId();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const resolvedTheme = useSyncExternalStore(
    subscribeToColorScheme,
    getSystemTheme,
    () => 'dark' as const,
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setTheme(e.target.value as ThemeOption);
    },
    [setTheme],
  );

  return (
    <div
      role="radiogroup"
      aria-labelledby={groupId}
      className={styles.radioGroup}
    >
      <span id={groupId} className={styles.visuallyHidden}>
        Theme
      </span>
      {THEME_OPTIONS.map(({ value, label }) => (
        <label key={value} className={styles.option}>
          <input
            type="radio"
            name="theme"
            value={value}
            checked={theme === value}
            onChange={handleChange}
          />
          <span>{label}</span>
        </label>
      ))}
      {theme === 'system' && (
        <p className={styles.hint}>
          Currently: {resolvedTheme === 'dark' ? 'Dark' : 'Light'}
        </p>
      )}
    </div>
  );
}
