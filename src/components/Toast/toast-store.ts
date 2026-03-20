/**
 * Toast notification store — Zustand store for triggering toasts from anywhere.
 * Used by reportError() and directly by components.
 */

import { createStore } from 'zustand/vanilla';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastSeverity = 'error' | 'warning' | 'info' | 'success';

export interface ToastItem {
  readonly id: string;
  readonly severity: ToastSeverity;
  readonly message: string;
  readonly duration: number;
}

export interface ToastState {
  readonly toasts: readonly ToastItem[];
}

export interface ToastActions {
  addToast: (
    severity: ToastSeverity,
    message: string,
    duration?: number,
  ) => void;
  dismissToast: (id: string) => void;
  clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DURATION_MS = 5_000;
const ERROR_DURATION_MS = 0; // 0 = manual dismiss only
const MAX_TOASTS = 5;

let nextId = 0;

function generateId(): string {
  return `toast-${++nextId}`;
}

function getDuration(severity: ToastSeverity, explicit?: number): number {
  if (explicit !== undefined) return explicit;
  return severity === 'error' ? ERROR_DURATION_MS : DEFAULT_DURATION_MS;
}

// ---------------------------------------------------------------------------
// Store (vanilla — shared across React and non-React code like reportError)
// ---------------------------------------------------------------------------

export const toastStore = createStore<ToastState & ToastActions>()((set) => ({
  toasts: [],

  addToast: (severity, message, duration) => {
    const toast: ToastItem = {
      id: generateId(),
      severity,
      message,
      duration: getDuration(severity, duration),
    };

    set((state) => ({
      toasts: [...state.toasts, toast].slice(-MAX_TOASTS),
    }));
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  },
}));

/** Convenience: add a toast without importing the store directly. */
export function showToast(
  severity: ToastSeverity,
  message: string,
  duration?: number,
): void {
  toastStore.getState().addToast(severity, message, duration);
}

/** Reset ID counter — for testing only. */
export function resetToastIdCounter(): void {
  nextId = 0;
}
