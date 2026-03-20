import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { registerServiceWorker } from './pwa/sw-registration';
import './styles/global.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Register service worker after React hydrates — non-blocking
registerServiceWorker();

// Dev-only: initialize client-side tracing (document load span)
if (import.meta.env.DEV) {
  import('./otel/instrumentation').then(({ initInstrumentation }) =>
    initInstrumentation(),
  );
}
