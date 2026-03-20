/**
 * useToast — React hook for the toast store.
 */

import { useSyncExternalStore } from 'react';

import type { ToastItem, ToastSeverity } from './toast-store';
import { toastStore } from './toast-store';

function subscribe(callback: () => void): () => void {
  return toastStore.subscribe(callback);
}

function getSnapshot(): readonly ToastItem[] {
  return toastStore.getState().toasts;
}

/** Read current toasts reactively. */
export function useToasts(): readonly ToastItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Imperative toast actions for use in components. */
export function useToast(): {
  addToast: (
    severity: ToastSeverity,
    message: string,
    duration?: number,
  ) => void;
  dismissToast: (id: string) => void;
  clearAll: () => void;
} {
  const { addToast, dismissToast, clearAll } = toastStore.getState();
  return { addToast, dismissToast, clearAll };
}
