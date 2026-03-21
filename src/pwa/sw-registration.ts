// ── Service Worker Registration ───────────────────────────────────────
//
// Registers the service worker, detects updates, and provides a mechanism
// for the UI to subscribe to update state and trigger skipWaiting.

type UpdateCallback = (state: SwUpdateState) => void;

export interface SwUpdateState {
  readonly updateAvailable: boolean;
  readonly applying: boolean;
}

const listeners = new Set<UpdateCallback>();
let currentState: SwUpdateState = { updateAvailable: false, applying: false };

const notify = (state: SwUpdateState): void => {
  currentState = state;
  for (const cb of listeners) {
    cb(state);
  }
};

/**
 * Subscribe to service worker update state changes.
 * Returns an unsubscribe function.
 */
export const onSwUpdate = (callback: UpdateCallback): (() => void) => {
  listeners.add(callback);
  // Deliver current state immediately so subscriber is in sync
  callback(currentState);
  return () => {
    listeners.delete(callback);
  };
};

/**
 * Get the current service worker update state.
 */
export const getSwUpdateState = (): SwUpdateState => currentState;

let waitingWorker: ServiceWorker | null = null;

/**
 * Tell the waiting service worker to skip waiting and take over.
 * The page will reload once the new SW activates.
 */
export const applySwUpdate = (): void => {
  if (!waitingWorker) return;
  notify({ updateAvailable: true, applying: true });
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
};

/**
 * Register the service worker and set up update detection.
 * Call this once during app startup.
 */
export const registerServiceWorker = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) return;

  try {
    const base = import.meta.env.BASE_URL;
    const registration = await navigator.serviceWorker.register(
      `${base}sw.js`,
      { scope: base },
    );

    // Check if an update is already waiting (e.g., from a previous page load)
    if (registration.waiting) {
      waitingWorker = registration.waiting;
      notify({ updateAvailable: true, applying: false });
    }

    // Detect when a new SW is installed and waiting
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (
          newWorker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          // New SW is waiting — there's an update available
          waitingWorker = newWorker;
          notify({ updateAvailable: true, applying: false });
        }
      });
    });

    // When the controlling SW changes (after skipWaiting), reload to get fresh assets.
    // Guard: on first visit, clients.claim() triggers controllerchange even though
    // there's no update — skip the reload in that case.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) {
        window.location.reload();
      }
    });
  } catch (error) {
    // SW registration failure is non-fatal — the app works without it
    console.warn('Service worker registration failed:', error);
  }
};
