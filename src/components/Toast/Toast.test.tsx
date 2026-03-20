import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import { ToastContainer } from './Toast';
import { toastStore, showToast, resetToastIdCounter } from './toast-store';

describe('toast-store', () => {
  beforeEach(() => {
    toastStore.getState().clearAll();
    resetToastIdCounter();
  });

  it('adds a toast to the store', () => {
    toastStore.getState().addToast('info', 'Hello');
    expect(toastStore.getState().toasts).toHaveLength(1);
    expect(toastStore.getState().toasts[0].message).toBe('Hello');
    expect(toastStore.getState().toasts[0].severity).toBe('info');
  });

  it('generates unique IDs', () => {
    toastStore.getState().addToast('info', 'One');
    toastStore.getState().addToast('info', 'Two');
    const ids = toastStore.getState().toasts.map((t) => t.id);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('sets error duration to 0 (manual dismiss)', () => {
    toastStore.getState().addToast('error', 'Oops');
    expect(toastStore.getState().toasts[0].duration).toBe(0);
  });

  it('sets non-error duration to 5000ms by default', () => {
    toastStore.getState().addToast('info', 'Note');
    expect(toastStore.getState().toasts[0].duration).toBe(5_000);
  });

  it('respects explicit duration override', () => {
    toastStore.getState().addToast('info', 'Custom', 10_000);
    expect(toastStore.getState().toasts[0].duration).toBe(10_000);
  });

  it('dismisses a toast by ID', () => {
    toastStore.getState().addToast('info', 'A');
    toastStore.getState().addToast('info', 'B');
    const idToRemove = toastStore.getState().toasts[0].id;
    toastStore.getState().dismissToast(idToRemove);
    expect(toastStore.getState().toasts).toHaveLength(1);
    expect(toastStore.getState().toasts[0].message).toBe('B');
  });

  it('clears all toasts', () => {
    toastStore.getState().addToast('info', 'A');
    toastStore.getState().addToast('info', 'B');
    toastStore.getState().clearAll();
    expect(toastStore.getState().toasts).toHaveLength(0);
  });

  it('caps at MAX_TOASTS (5)', () => {
    for (let i = 0; i < 10; i++) {
      toastStore.getState().addToast('info', `Toast ${i}`);
    }
    expect(toastStore.getState().toasts).toHaveLength(5);
    // Oldest toasts should be dropped
    expect(toastStore.getState().toasts[0].message).toBe('Toast 5');
  });

  it('showToast convenience adds to store', () => {
    showToast('success', 'Done!');
    expect(toastStore.getState().toasts).toHaveLength(1);
    expect(toastStore.getState().toasts[0].severity).toBe('success');
  });
});

describe('ToastContainer', () => {
  beforeEach(() => {
    toastStore.getState().clearAll();
    resetToastIdCounter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders toasts from the store', async () => {
    showToast('error', 'Something broke');

    render(<ToastContainer />);

    expect(await screen.findByText('Something broke')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders multiple toasts', async () => {
    showToast('info', 'First toast');
    showToast('warning', 'Second toast');

    render(<ToastContainer />);

    expect(await screen.findByText('First toast')).toBeInTheDocument();
    expect(screen.getByText('Second toast')).toBeInTheDocument();
  });

  it('dismiss button removes a toast', async () => {
    showToast('error', 'Dismiss me');

    render(<ToastContainer />);

    expect(await screen.findByText('Dismiss me')).toBeInTheDocument();

    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
    });
  });

  it('renders severity labels', async () => {
    showToast('success', 'Yay');
    render(<ToastContainer />);
    expect(await screen.findByText('Success')).toBeInTheDocument();
  });
});
