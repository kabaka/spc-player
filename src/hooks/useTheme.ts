import { useEffect } from 'react';

import { useAppStore } from '@/store/store';

export const useTheme = () => {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');

    if (theme === 'system') {
      localStorage.removeItem('spc-theme');
      const preferLight = window.matchMedia(
        '(prefers-color-scheme: light)',
      ).matches;
      root.classList.add(preferLight ? 'light' : 'dark');
    } else {
      localStorage.setItem('spc-theme', theme);
      root.classList.add(theme);
    }
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      const root = document.documentElement;
      root.classList.remove('dark', 'light');
      root.classList.add(mq.matches ? 'light' : 'dark');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return { theme, setTheme };
};
