import { useCallback, useId } from 'react';
import type { ChangeEvent } from 'react';

import { useAppStore } from '@/store/store';
import styles from './ThemeSettings.module.css';

import type { SettingsSlice } from '@/store/types';

type ThemeOption = SettingsSlice['theme'];

const THEME_OPTIONS: readonly { value: ThemeOption; label: string }[] = [
  { value: 'dark', label: '🌙 Dark' },
  { value: 'light', label: '☀️ Light' },
  { value: 'system', label: '💻 System' },
];

export function ThemeSettings() {
  const groupId = useId();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

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
    </div>
  );
}
