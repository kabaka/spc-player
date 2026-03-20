/**
 * Toast notification component — Radix UI Toast with CSS Modules.
 * Renders stacked toast notifications with auto-dismiss and manual close.
 *
 * @see docs/adr/0015-error-handling.md — toast display strategy
 */

import { useCallback } from 'react';
import { Toast as RadixToast } from 'radix-ui';

import type { ToastItem, ToastSeverity } from './toast-store';
import { toastStore } from './toast-store';
import { useToasts } from './useToast';
import styles from './Toast.module.css';

// ---------------------------------------------------------------------------
// Severity → ARIA live region mapping
// ---------------------------------------------------------------------------

function ariaLiveForSeverity(severity: ToastSeverity): 'assertive' | 'polite' {
  return severity === 'error' || severity === 'warning'
    ? 'assertive'
    : 'polite';
}

function severityLabel(severity: ToastSeverity): string {
  switch (severity) {
    case 'error':
      return 'Error';
    case 'warning':
      return 'Warning';
    case 'info':
      return 'Info';
    case 'success':
      return 'Success';
  }
}

// ---------------------------------------------------------------------------
// Single Toast Item
// ---------------------------------------------------------------------------

interface ToastEntryProps {
  readonly toast: ToastItem;
}

function ToastEntry({ toast }: ToastEntryProps) {
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        toastStore.getState().dismissToast(toast.id);
      }
    },
    [toast.id],
  );

  return (
    <RadixToast.Root
      className={`${styles.root} ${styles[toast.severity]}`}
      duration={toast.duration === 0 ? Infinity : toast.duration}
      onOpenChange={handleOpenChange}
      role={
        toast.severity === 'error' || toast.severity === 'warning'
          ? 'alert'
          : 'status'
      }
      aria-live={ariaLiveForSeverity(toast.severity)}
    >
      <RadixToast.Title className={styles.title}>
        {severityLabel(toast.severity)}
      </RadixToast.Title>
      <RadixToast.Description className={styles.description}>
        {toast.message}
      </RadixToast.Description>
      <RadixToast.Close className={styles.close} aria-label="Dismiss">
        ✕
      </RadixToast.Close>
    </RadixToast.Root>
  );
}

// ---------------------------------------------------------------------------
// Toast Container — mounts at the root
// ---------------------------------------------------------------------------

export function ToastContainer() {
  const toasts = useToasts();

  return (
    <RadixToast.Provider swipeDirection="right">
      {toasts.map((toast) => (
        <ToastEntry key={toast.id} toast={toast} />
      ))}
      <RadixToast.Viewport className={styles.viewport} />
    </RadixToast.Provider>
  );
}
