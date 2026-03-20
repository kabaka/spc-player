import { useCallback, useState } from 'react';

import { useShortcut } from '@/shortcuts/useShortcut';

export interface UseHexDecimalToggleReturn {
  readonly isHex: boolean;
  readonly toggle: () => void;
  readonly format: (value: number, padLength?: number) => string;
}

export function useHexDecimalToggle(initial = true): UseHexDecimalToggleReturn {
  const [isHex, setIsHex] = useState(initial);

  const toggle = useCallback(() => {
    setIsHex((prev) => !prev);
  }, []);

  const format = useCallback(
    (value: number, padLength = 2): string => {
      if (isHex) {
        return (
          '$' +
          (value & 0xff).toString(16).toUpperCase().padStart(padLength, '0')
        );
      }
      return String(value & 0xff);
    },
    [isHex],
  );

  useShortcut('analysis.toggleHexDecimal', toggle, { scope: 'contextual' });

  return { isHex, toggle, format };
}
