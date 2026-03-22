import { useMemo } from 'react';

import { defaultKeymap } from '@/shortcuts/default-keymap';
import type { ShortcutBinding } from '@/shortcuts/types';

import styles from './KeyboardShortcutSettings.module.css';

// ── Helpers ───────────────────────────────────────────────────────────

function formatActionId(actionId: string): string {
  return actionId
    .replace(/\./g, ' › ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase());
}

function formatKey(key: string): string {
  return key
    .replace('Key', '')
    .replace('Digit', '')
    .replace('Arrow', '→ '.slice(0, 0)) // strip prefix
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('BracketLeft', '[')
    .replace('BracketRight', ']')
    .replace('Backquote', '`')
    .replace('Backspace', '⌫')
    .replace('Slash', '/')
    .replace('Ctrl+', '⌘ ')
    .replace('Shift+', '⇧ ')
    .replace('Alt+', '⌥ ')
    .replace('Space', '␣');
}

// ── Component ─────────────────────────────────────────────────────────

export function KeyboardShortcutSettings() {
  const entries = useMemo(() => {
    const result: ShortcutBinding[] = [];
    for (const binding of defaultKeymap.values()) {
      result.push(binding);
    }
    return result;
  }, []);

  return (
    <div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Action</th>
            <th>Key Binding</th>
            <th>Scope</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((binding) => (
            <tr key={binding.actionId}>
              <td>{formatActionId(binding.actionId)}</td>
              <td className={styles.keyBinding}>
                {binding.keys.map((key, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    <kbd className={styles.kbd}>{formatKey(key)}</kbd>
                  </span>
                ))}
              </td>
              <td className={styles.scope}>{binding.scope}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.readOnlyNote}>
        Keyboard shortcuts are currently read-only. Customization support will
        be added in a future update.
      </p>
    </div>
  );
}
