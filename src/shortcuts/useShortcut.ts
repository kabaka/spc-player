import { useEffect, useRef } from 'react';

import { shortcutManager } from './ShortcutManager';
import type { ShortcutActionId, ShortcutOptions } from './types';

export function useShortcut(
  actionId: ShortcutActionId,
  handler: () => void,
  options?: Partial<ShortcutOptions>,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const scope = options?.scope ?? 'global';
  const preventDefault = options?.preventDefault;
  const allowRepeat = options?.allowRepeat;

  useEffect(() => {
    const stableHandler = (event: KeyboardEvent) => {
      void event;
      handlerRef.current();
    };

    shortcutManager.register(actionId, stableHandler, {
      scope,
      preventDefault,
      allowRepeat,
    });

    return () => {
      shortcutManager.unregister(actionId, stableHandler);
    };
  }, [actionId, scope, preventDefault, allowRepeat]);
}
